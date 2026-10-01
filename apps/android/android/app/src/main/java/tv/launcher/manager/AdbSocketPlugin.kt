package tv.launcher.manager

import android.app.UiModeManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Canvas
import android.os.Build
import android.provider.Settings
import android.util.Base64
import com.flyfishxu.kadb.Kadb
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.runBlocking
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.net.InetSocketAddress
import java.net.Socket
import java.net.SocketTimeoutException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.atomic.AtomicInteger
import javax.net.ssl.SSLSocket

/**
 * AdbSocket — the ONLY native piece of the app (DESIGN_NOTES §13).
 *
 * Raw TCP sockets for Tango (the ADB protocol runs in JS, packages/adb/src/capacitor.ts), plus the
 * two things JS cannot do on a phone: the TLS upgrade of a socket with a persistent client
 * certificate (Android 11+ Wireless debugging) and the SPAKE2 pairing that makes the TV trust that
 * certificate (Kadb). Everything runs off the main thread and off Capacitor's single plugin thread:
 * a blocking `read` must never stall a `write`, so reads go to a cached pool and writes to a
 * per-socket serial executor (order preserved).
 *
 * Read model: PULL. `read({id, max, timeoutMs})` blocks (on its own thread) until at least one byte
 * arrives, EOF, or the timeout, and answers `{data: base64, eof}`; a timeout is `{data: "", eof:
 * false}` and the JS side simply asks again. This mirrors a ReadableStream `pull` with back-pressure
 * and keeps ordering trivial. (A `data` listener event was the alternative; rejected because events
 * have no back-pressure and Capacitor delivers them through the main thread.)
 *
 * Wireless debugging is STARTTLS, not TLS-from-the-start: the client sends CNXN in the clear, the
 * daemon answers STLS, the client replies STLS and only then both sides handshake on the SAME
 * socket. Hence `connect` is always plain and `startTls({id})` upgrades the socket in place; the JS
 * side drives the order. The daemon verifies our certificate's public key against the keys it
 * learned at pairing — an unpaired phone gets the connection closed right after the handshake.
 *
 * Methods (all Promise-returning):
 *   connect({host, port, timeoutMs?})       → {id}
 *   startTls({id})                          → {protocol, peerFingerprint}
 *   write({id, data: base64})               → void
 *   read({id, max?, timeoutMs?})            → {data: base64, eof}
 *   close({id})                             → void
 *   pair({host, port, code, name?})         → {fingerprint}   Kadb, SPAKE2 + TLS
 *   identity()                              → {fingerprint, notAfter}
 *   deviceInfo()                            → {isTv, model, sdk, release, home, ips, developer, adb, wirelessAdb}
 *   openSettings({screen})                  → {opened, target?}   About / Developer options / Wi-Fi, on THIS set
 *   appIcons({packages})                    → {icons: {pkg: base64 png}}   what the launcher picker shows
 *   discover({subnet?, port?, timeoutMs?, scan?, mdns?}) → {hosts: [{host, port, source, service?, name?}], subnet}
 */
@CapacitorPlugin(name = "AdbSocket")
class AdbSocketPlugin : Plugin() {

    private class Conn(val id: String, val host: String, val port: Int, first: Socket) {
        @Volatile var socket: Socket = first
        @Volatile var input: InputStream = first.getInputStream()
        @Volatile var output: OutputStream = first.getOutputStream()
        /** Writes are serialised per socket so packets never interleave. */
        val writer: ExecutorService = Executors.newSingleThreadExecutor()
        /** One blocking read at a time per socket (the JS side never overlaps them anyway). */
        val readLock = Any()
    }

    private val conns = ConcurrentHashMap<String, Conn>()
    private val pool = Executors.newCachedThreadPool()
    private val nextId = AtomicInteger(1)

    override fun handleOnDestroy() {
        conns.values.forEach { closeConn(it) }
        conns.clear()
        pool.shutdownNow()
    }

    private fun conn(call: PluginCall): Conn? {
        val id = call.getString("id")
        val c = if (id == null) null else conns[id]
        if (c == null) call.reject("unknown socket ${id ?: "(no id)"}", "ENOSOCK")
        return c
    }

    private fun closeConn(c: Conn) {
        runCatching { c.socket.close() }
        c.writer.shutdownNow()
    }

    // ------------------------------------------------------------------ the host device

    /**
     * Is this a television? Asked once at boot: the UI scales up and keeps the focus ring visible
     * on a TV, because there is no mouse and the viewer sits three metres away.
     *
     * Three signals, because none is reliable alone: the ui mode is what the system itself uses,
     * FEATURE_LEANBACK is what the Play Store filters on, and FEATURE_TELEVISION is the old one
     * that some cheap boxes still ship instead.
     */
    @PluginMethod
    fun deviceInfo(call: PluginCall) {
        val pm = context.packageManager
        val uiMode = (context.getSystemService(Context.UI_MODE_SERVICE) as? UiModeManager)?.currentModeType
        val isTv = uiMode == Configuration.UI_MODE_TYPE_TELEVISION ||
            pm.hasSystemFeature(PackageManager.FEATURE_LEANBACK) ||
            @Suppress("DEPRECATION") pm.hasSystemFeature(PackageManager.FEATURE_TELEVISION)
        val ips = JSArray()
        for (ip in Discovery(context).localAddresses()) ips.put(ip)
        // The three switches the "set up this TV" step waits for. Reading Settings.Global needs no
        // permission (writing it would need WRITE_SECURE_SETTINGS); `adb_wifi_enabled` is Android
        // 11+ wireless debugging, whose key is not a public constant but whose value is readable.
        // Which launcher answers HOME on THIS set. It says what kind of box this is better than any
        // brand list (launcherx = Google TV, tvlauncher = Android TV, com.amazon.tv.* = Fire TV), so
        // when the box is this television nobody has to be asked.
        val home = try {
            pm.resolveActivity(
                Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME),
                PackageManager.MATCH_DEFAULT_ONLY,
            )?.activityInfo?.packageName ?: ""
        } catch (_: Exception) {
            ""
        }
        // Μπορεί ΑΥΤΗ η συσκευή να ανοίξει επιλογέα αρχείου; Ο δρόμος «Έχω το APK» είναι ένα
        // <input type=file> του WebView, που καταλήγει σε GET_CONTENT (ή OPEN_DOCUMENT). Σε
        // τηλεόραση συνήθως δεν απαντά κανείς, και το πάτημα έβγαζε το toast του Android αντί
        // για κάτι δικό μας. Ρωτάμε μία φορά, εδώ, μαζί με όλα τα άλλα.
        // ΠΡΟΣΟΧΗ: το resolveActivity ΔΕΝ είναι η ερώτηση — το ΠΟΙΟΣ απαντά είναι. Το Android TV
        // απαντά σε αυτά τα intents με τα `frameworkpackagestubs`, δηλαδή με μια Activity που η
        // ΜΟΝΗ της δουλειά είναι να δείξει το "You don't have an app that can do this" και να
        // κλείσει (μετρημένο στον emulator 29/9: Stubs$DocumentsStub). Ίδια παγίδα με τα stubs των
        // Settings — μνήμη android-tv-settings-stubs.
        // ΔΥΟ παγίδες, και οι δύο μετρημένες στον emulator (29/9):
        //  1. Το Android TV ΑΠΑΝΤΑ σε αυτά τα intents με τα `frameworkpackagestubs` — Activity που η
        //     ΜΟΝΗ της δουλειά είναι να δείξει "You don't have an app that can do this" και να
        //     κλείσει (Stubs$DocumentsStub, Stubs$MediaStub). Ίδια παγίδα με τα stubs των Settings,
        //     μνήμη android-tv-settings-stubs: το ερώτημα δεν είναι ΑΝ απαντά κάποιος αλλά ΠΟΙΟΣ.
        //  2. Γι' αυτό ΟΧΙ resolveActivity: με δύο υποψήφιους και κανέναν προεπιλεγμένο επιστρέφει
        //     τον ResolverActivity του συστήματος (package "android"), που περνούσε τον έλεγχο του
        //     stub παρότι από πίσω του δεν υπήρχε τίποτα άλλο από τα δύο stubs.
        fun canOpen(action: String) = try {
            val i = Intent(action).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
            pm.queryIntentActivities(i, PackageManager.MATCH_DEFAULT_ONLY)
                .any { !(it.activityInfo?.packageName ?: "").contains("frameworkpackagestubs") }
        } catch (_: Exception) {
            false
        }
        val canPickFile = canOpen(Intent.ACTION_GET_CONTENT) || canOpen(Intent.ACTION_OPEN_DOCUMENT)

        val cr = context.contentResolver
        fun flag(key: String) = try {
            Settings.Global.getInt(cr, key, 0) == 1
        } catch (_: Exception) {
            false
        }
        call.resolve(
            JSObject()
                .put("isTv", isTv)
                .put("model", Build.MODEL ?: "")
                .put("manufacturer", Build.MANUFACTURER ?: "")
                .put("sdk", Build.VERSION.SDK_INT)
                .put("release", Build.VERSION.RELEASE ?: "")
                // Was this copy distributed by Play? Then it never offers an APK from the
                // internet (Play DDA §4.5) — the sideload build does, and that is the whole
                // difference. Two signals because either one alone can be wrong: the flavour it was
                // built as, and the store that actually installed it.
                .put("playBuild", BuildConfig.FLAVOR_store == "googlePlay" || installerOf() == "com.android.vending")
                .put("home", home)
                .put("canPickFile", canPickFile)
                .put("ips", ips)
                .put("developer", flag(Settings.Global.DEVELOPMENT_SETTINGS_ENABLED))
                .put("adb", flag(Settings.Global.ADB_ENABLED))
                .put("wirelessAdb", flag("adb_wifi_enabled")),
        )
    }

    /**
     * The real icons of apps on THIS device, as PNG — what the launcher picker shows instead of a
     * letter in a box. Reading them out of the APK is not an option: resource names are renamed in
     * an optimised build (`res/jQ.png`), so there is no `ic_launcher.png` to find. PackageManager
     * has the rendered drawable already, which is why this exists at all.
     *
     * Visibility: every launcher answers the HOME intent, and the manifest's <queries> declares
     * exactly that intent — so these packages are visible without QUERY_ALL_PACKAGES, which is a
     * restricted permission we will never ask for.
     */
    @PluginMethod
    fun appIcons(call: PluginCall) {
        val names = call.getArray("packages") ?: JSArray()
        val pm = context.packageManager
        val icons = JSObject()
        for (i in 0 until names.length()) {
            val pkg = names.optString(i, "") ?: ""
            if (pkg.isBlank()) continue
            try {
                val d = pm.getApplicationIcon(pkg)
                val size = 96
                val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
                d.setBounds(0, 0, size, size)
                d.draw(Canvas(bmp))
                val bytes = ByteArrayOutputStream().also { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }.toByteArray()
                bmp.recycle()
                icons.put(pkg, Base64.encodeToString(bytes, Base64.NO_WRAP))
            } catch (_: Exception) {
                // not installed here, or not visible to us — the row keeps its letter tile
            }
        }
        call.resolve(JSObject().put("icons", icons))
    }

    /** Which store installed this copy, if any (`com.android.vending` = Google Play). */
    private fun installerOf(): String? = try {
        val pm = context.packageManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            pm.getInstallSourceInfo(context.packageName).installingPackageName
        } else {
            @Suppress("DEPRECATION") pm.getInstallerPackageName(context.packageName)
        }
    } catch (_: Exception) {
        null
    }

    /**
     * Open a system settings screen on THIS device — the wizard sends the installer to the About
     * screen instead of describing where it is, then watches `deviceInfo` for the switch to flip.
     *
     * Android TV ships stubs that answer a settings intent with nothing but a toast
     * (com.android.tv.frameworkpackagestubs), so `resolveActivity` proves nothing: every candidate
     * is simply tried in order, and the answer says whether any of them started at all. When none
     * does, the UI falls back to telling the installer the path for their remote.
     */
    @PluginMethod
    fun openSettings(call: PluginCall) {
        val actions = when (call.getString("screen") ?: "settings") {
            "about" -> listOf(Settings.ACTION_DEVICE_INFO_SETTINGS, Settings.ACTION_SETTINGS)
            "dev" -> listOf(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS, Settings.ACTION_DEVICE_INFO_SETTINGS, Settings.ACTION_SETTINGS)
            "wifi" -> listOf(Settings.ACTION_WIFI_SETTINGS, Settings.ACTION_WIRELESS_SETTINGS, Settings.ACTION_SETTINGS)
            else -> listOf(Settings.ACTION_SETTINGS)
        }
        for (action in actions) {
            try {
                context.startActivity(Intent(action).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                return call.resolve(JSObject().put("opened", true).put("target", action))
            } catch (_: Exception) {
                // nothing handles this one on this box — try the next
            }
        }
        call.resolve(JSObject().put("opened", false))
    }

    // ------------------------------------------------------------------ sockets

    @PluginMethod
    fun connect(call: PluginCall) {
        val host = call.getString("host")
        if (host.isNullOrBlank()) return call.reject("host required", "EARG")
        val port = call.getInt("port") ?: 5555
        val timeoutMs = call.getInt("timeoutMs") ?: 5000
        pool.execute {
            try {
                val s = Socket()
                s.tcpNoDelay = true
                s.connect(InetSocketAddress(host, port), timeoutMs)
                val id = "s" + nextId.getAndIncrement()
                conns[id] = Conn(id, host, port, s)
                call.resolve(JSObject().put("id", id))
            } catch (e: Exception) {
                call.reject("connect $host:$port failed: ${e.message}", "ECONNECT", e)
            }
        }
    }

    @PluginMethod
    fun startTls(call: PluginCall) {
        val conn = conn(call) ?: return
        pool.execute {
            try {
                val factory = AdbIdentity.sslContext(context).socketFactory
                val ssl = factory.createSocket(conn.socket, conn.host, conn.port, true) as SSLSocket
                ssl.useClientMode = true
                // adbd's TLS server speaks TLS 1.3 only. Phones below Android 10 have no TLS 1.3:
                // they can still use the classic :5555 path, but not Wireless debugging.
                if (!ssl.supportedProtocols.contains("TLSv1.3")) {
                    throw IllegalStateException("this phone has no TLS 1.3 (Android 10+ is needed for Wireless debugging)")
                }
                ssl.enabledProtocols = arrayOf("TLSv1.3")
                ssl.soTimeout = 10_000
                ssl.startHandshake()
                ssl.soTimeout = 0
                conn.socket = ssl
                conn.input = ssl.inputStream
                conn.output = ssl.outputStream
                val peer = runCatching { ssl.session.peerCertificates.firstOrNull() }.getOrNull()
                call.resolve(
                    JSObject()
                        .put("protocol", ssl.session.protocol ?: "")
                        .put("peerFingerprint", peer?.let { AdbIdentity.fingerprint(it.encoded) } ?: "")
                )
            } catch (e: Exception) {
                conns.remove(conn.id)
                closeConn(conn)
                call.reject("TLS handshake with ${conn.host} failed: ${e.message}", "ETLS", e)
            }
        }
    }

    @PluginMethod
    fun write(call: PluginCall) {
        val conn = conn(call) ?: return
        val data = call.getString("data") ?: ""
        val bytes = try {
            Base64.decode(data, Base64.DEFAULT)
        } catch (e: IllegalArgumentException) {
            return call.reject("data is not base64", "EARG")
        }
        try {
            conn.writer.execute {
                try {
                    conn.output.write(bytes)
                    conn.output.flush()
                    call.resolve()
                } catch (e: Exception) {
                    call.reject("write failed: ${e.message}", "EWRITE", e)
                }
            }
        } catch (e: RejectedExecutionException) {
            call.reject("socket closed", "ECLOSED")
        }
    }

    @PluginMethod
    fun read(call: PluginCall) {
        val conn = conn(call) ?: return
        val max = (call.getInt("max") ?: DEFAULT_READ_MAX).coerceIn(1, MAX_READ)
        val timeoutMs = (call.getInt("timeoutMs") ?: DEFAULT_READ_TIMEOUT_MS).coerceAtLeast(0)
        pool.execute {
            synchronized(conn.readLock) {
                try {
                    conn.socket.soTimeout = timeoutMs
                    val buf = ByteArray(max)
                    val n = try {
                        conn.input.read(buf)
                    } catch (e: SocketTimeoutException) {
                        0
                    }
                    if (n < 0) {
                        call.resolve(JSObject().put("data", "").put("eof", true))
                    } else {
                        call.resolve(JSObject().put("data", Base64.encodeToString(buf, 0, n, Base64.NO_WRAP)).put("eof", false))
                    }
                } catch (e: Exception) {
                    // Closed under us (close() from JS, or the box went away): that is EOF, not an error.
                    call.resolve(JSObject().put("data", "").put("eof", true))
                }
            }
        }
    }

    @PluginMethod
    fun close(call: PluginCall) {
        val id = call.getString("id")
        if (id != null) conns.remove(id)?.let { closeConn(it) }
        call.resolve()
    }

    // ------------------------------------------------------------------ identity + pairing

    /**
     * Android 11+ Wireless debugging pairing: the 6-digit code and host:port from the TV's "Pair
     * with pairing code" dialog. Kadb runs the SPAKE2 exchange over its own TLS connection with OUR
     * identity (AdbIdentity), so after this the TV trusts the certificate `startTls` presents.
     */
    @PluginMethod
    fun pair(call: PluginCall) {
        val host = call.getString("host")
        if (host.isNullOrBlank()) return call.reject("host required", "EARG")
        val port = call.getInt("port") ?: return call.reject("port required (the pairing port on the TV, not 5555)", "EARG")
        val code = call.getString("code")?.trim() ?: ""
        if (!code.matches(Regex("\\d{6}"))) return call.reject("code must be the 6 digits shown on the TV", "EARG")
        val name = call.getString("name") ?: "TV Launcher Manager (${Build.MODEL})"
        pool.execute {
            try {
                val identity = AdbIdentity.ensure(context)
                runBlocking { Kadb.pair(host, port, code, name) }
                call.resolve(JSObject().put("fingerprint", identity.fingerprintSha256))
            } catch (e: Exception) {
                call.reject("pairing with $host:$port failed: ${e.message}", "EPAIR", e)
            }
        }
    }

    @PluginMethod
    fun identity(call: PluginCall) {
        pool.execute {
            try {
                val id = AdbIdentity.ensure(context)
                call.resolve(JSObject().put("fingerprint", id.fingerprintSha256).put("notAfter", id.notAfterEpochMillis))
            } catch (e: Exception) {
                call.reject("identity failed: ${e.message}", "EIDENTITY", e)
            }
        }
    }

    // ------------------------------------------------------------------ discovery

    /**
     * Parallel TCP scan of the /24 on :5555 (300 ms per host, 64 at a time) + mDNS browse of
     * `_adb-tls-connect._tcp` (Wireless debugging), `_adb-tls-pairing._tcp` (pairing dialog open)
     * and `_adb._tcp` for `timeoutMs`. See Discovery.kt.
     */
    @PluginMethod
    fun discover(call: PluginCall) {
        val subnet = call.getString("subnet")
        val port = call.getInt("port") ?: 5555
        val timeoutMs = (call.getInt("timeoutMs") ?: 3000).coerceIn(500, 30_000)
        val scan = call.getBoolean("scan") ?: true
        val mdns = call.getBoolean("mdns") ?: true
        pool.execute {
            try {
                val result = Discovery(context).run(subnet, port, timeoutMs, scan, mdns)
                val hosts = JSArray()
                for (h in result.hosts) {
                    val o = JSObject().put("host", h.host).put("port", h.port).put("source", h.source)
                    if (h.service != null) o.put("service", h.service)
                    if (h.name != null) o.put("name", h.name)
                    hosts.put(o)
                }
                val out = JSObject().put("hosts", hosts)
                if (result.subnet != null) out.put("subnet", result.subnet)
                // our own addresses travel with the result: the scan reaches this device's adbd too
                val ips = JSArray()
                for (ip in Discovery(context).localAddresses()) ips.put(ip)
                out.put("localIps", ips)
                call.resolve(out)
            } catch (e: Exception) {
                call.reject("discover failed: ${e.message}", "EDISCOVER", e)
            }
        }
    }

    private companion object {
        const val DEFAULT_READ_MAX = 256 * 1024
        const val MAX_READ = 4 * 1024 * 1024
        const val DEFAULT_READ_TIMEOUT_MS = 30_000
    }
}
