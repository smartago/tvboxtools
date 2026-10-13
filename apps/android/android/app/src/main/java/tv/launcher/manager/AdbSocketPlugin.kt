package tv.launcher.manager

import android.app.PendingIntent
import android.app.UiModeManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Canvas
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Base64
import android.util.Log
import com.flyfishxu.kadb.Kadb
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.runBlocking
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL
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
private const val SELF_INSTALL_ACTION = "tv.launcher.manager.SELF_INSTALL"

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

    /** Ο διακόπτης της δημόσιας Conscrypt γυρίζει ΜΙΑ φορά — δες useBundledConscrypt(). */
    @Volatile private var conscryptReady = false

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
        //  3. ΜΕ ΤΟΝ ΤΥΠΟ ΤΟΥ APK, ΟΧΙ «*/*» (Jim, 9/10/2026, Google TV 14 emulator: η κάρτα «Έχω το APK»
        //     εμφανιζόταν και το πάτημα έβγαζε πάλι το toast). Ένα intent με τύπο «*/*» ταιριάζει με
        //     ΟΠΟΙΟΝΔΗΠΟΤΕ δηλώνει τύπο — και ο photo picker (image/*) απαντούσε «ναι» για λογαριασμό
        //     ενός file manager που δεν υπάρχει. Το WebView όμως ζητά ακριβώς ό,τι λέει το `accept`
        //     του <input>: application/vnd.android.package-archive. Ρωτάμε λοιπόν ΑΥΤΟ.
        fun canOpen(action: String) = try {
            val i = Intent(action).addCategory(Intent.CATEGORY_OPENABLE).setType("application/vnd.android.package-archive")
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
                .put("packageName", context.packageName)
                .put("playBuild", BuildConfig.FLAVOR_store == "googlePlay" || installerOf() == "com.android.vending")
                // Installer-of-record ΟΝΟΜΑΣΤΙΚΑ (1/10/2026): το telemetry το στέλνει ως
                // `installer`, ώστε ο admin να δείχνει «ήρθε από Downloader/Downloader TV/Chrome»
                // αντί για «Sideload (inferred)». Ο server κάνει backfill το firstInstaller στο
                // πρώτο pulse που το κουβαλά — πιάνει και τους υπάρχοντες χρήστες.
                .put("installer", installerOf() ?: "")
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

    // ------------------------------------------------------- Η ΙΔΙΑ Η ΕΦΑΡΜΟΓΗ ΕΝΗΜΕΡΩΝΕΤΑΙ
    /**
     * ΜΠΟΡΟΥΜΕ ΝΑ ΕΓΚΑΤΑΣΤΗΣΟΥΜΕ ΕΔΩ; Από το Android 8 (API 26) η άδεια «άγνωστες πηγές» δίνεται
     * ΑΝΑ ΕΦΑΡΜΟΓΗ, σε μια οθόνη των ρυθμίσεων· πριν από αυτό υπήρχε ένας καθολικός διακόπτης που
     * δεν μπορούμε να ρωτήσουμε — εκεί λέμε «ναι» και απαντά ο εγκαταστάτης του συστήματος.
     */
    @PluginMethod
    fun canInstallPackages(call: PluginCall) {
        val ok = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.packageManager.canRequestPackageInstalls()
        } else {
            true
        }
        call.resolve(JSObject().put("granted", ok))
    }

    /** Η οθόνη όπου ανοίγει ο διακόπτης — ΓΙΑ ΑΥΤΗ την εφαρμογή, όχι ο γενικός κατάλογος. */
    @PluginMethod
    fun openInstallPermission(call: PluginCall) {
        val intents = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            listOf(
                Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + context.packageName)),
                Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES),
                Intent(Settings.ACTION_SETTINGS),
            )
        } else {
            listOf(Intent(Settings.ACTION_SECURITY_SETTINGS), Intent(Settings.ACTION_SETTINGS))
        }
        for (i in intents) {
            try {
                context.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                return call.resolve(JSObject().put("opened", true))
            } catch (_: Exception) {
                // δεν το χειρίζεται κανείς σε αυτό το κουτί — δοκίμασε το επόμενο
            }
        }
        call.resolve(JSObject().put("opened", false))
    }

    /**
     * ΚΑΤΕΒΑΖΕΙ ΤΟ APK ΚΑΙ ΑΝΟΙΓΕΙ ΤΟΝ ΕΓΚΑΤΑΣΤΑΤΗ ΤΟΥ ΣΥΣΤΗΜΑΤΟΣ — ο δρόμος που ακολουθούν ΟΛΑ
     * τα sideload app μας (UNI, REMAP, Downloader TV). Σε τηλεόραση δεν υπάρχει browser για να
     * σταλεί κάποιος σε σελίδα λήψης, και ακόμη κι αν υπήρχε, ένα αρχείο στα Downloads δεν
     * εγκαθίσταται μόνο του.
     *
     * ΓΙΑΤΙ ΟΧΙ ΜΕΣΑ ΑΠΟ ΤΟ WEBVIEW: η τηλεόραση τρέχει το Chrome που πάγωσε ο κατασκευαστής της,
     * με τη λίστα ριζικών πιστοποιητικών εκείνης της χρονιάς — το `fetch` σκάει με σκέτο TypeError
     * ενώ DNS, TCP και ρολόι είναι μια χαρά. Εδώ κατεβάζει η στοίβα ΤΟΥ ΣΥΣΤΗΜΑΤΟΣ.
     *
     * Η ΕΓΚΑΤΑΣΤΑΣΗ ΠΕΡΝΑ ΑΠΟ PackageInstaller SESSION, ΟΧΙ ΑΠΟ ACTION_VIEW (Jim, 3/10/2026: «δες
     * πώς το κάνουν UNI/STV που είναι capacitor ή PLUI kotlin»). Ο δρόμος ΟΛΩΝ των sideload app
     * μας. Ένα `ACTION_VIEW` με τύπο `application/vnd.android.package-archive` θέλει ΕΝΕΡΓΕΙΑ που
     * να το χειρίζεται — και πλήθος TV box δεν έχουν καμία («You don't have an app that can do
     * this»). Το session δεν ψάχνει κανέναν: το σύστημα δείχνει μόνο του το παράθυρο
     * επιβεβαίωσης, και δεν χρειάζεται ούτε FileProvider.
     */
    @PluginMethod
    fun downloadAndInstall(call: PluginCall) {
        val url = call.getString("url")
        if (url.isNullOrBlank()) return call.reject("url required", "EARG")
        pool.execute {
            var conn: HttpURLConnection? = null
            try {
                // Ο κατάλογος είναι δικός μας και καθαρίζεται ΠΡΩΤΑ: ένα μισοκατεβασμένο αρχείο
                // από προηγούμενη προσπάθεια θα εγκαθίστατο ως «χαλασμένο APK» χωρίς να φταίει κάτι.
                val dir = File(context.cacheDir, "update").apply { mkdirs() }
                dir.listFiles()?.forEach { it.delete() }
                val file = File(dir, "update.apk")

                conn = (URL(url).openConnection() as HttpURLConnection).apply {
                    connectTimeout = 20000
                    readTimeout = 60000
                    instanceFollowRedirects = true
                    connect()
                }
                val code = conn.responseCode
                if (code !in 200..299) throw java.io.IOException("GET $url -> $code")
                val total = conn.contentLength.toLong()
                var done = 0L
                var lastPct = -1
                conn.inputStream.use { input ->
                    FileOutputStream(file).use { out ->
                        val buf = ByteArray(1 shl 16)
                        while (true) {
                            val n = input.read(buf)
                            if (n < 0) break
                            out.write(buf, 0, n)
                            done += n
                            if (total > 0) {
                                val pct = (done * 100 / total).toInt()
                                // ΜΟΝΟ ΟΤΑΝ ΑΛΛΑΖΕΙ ΤΟ ΝΟΥΜΕΡΟ: ένα συμβάν ανά 64KB σε αρχείο 18MB
                                // είναι 280 περάσματα στο WebView για μπάρα που δείχνει το ίδιο.
                                if (pct != lastPct) {
                                    lastPct = pct
                                    notifyListeners("updateProgress", JSObject().put("percent", pct))
                                }
                            }
                        }
                    }
                }
                installSelf(file)
                call.resolve(JSObject().put("started", true).put("bytes", done))
            } catch (e: Exception) {
                Log.w("AdbSocket", "downloadAndInstall failed", e)
                call.reject(e.message ?: "download failed", "EUPDATE", e)
            } finally {
                runCatching { conn?.disconnect() }
            }
        }
    }

    /**
     * ΤΟ SESSION. Το `commit` απαντά σε ΡΗΤΟ intent προς την κλάση του δέκτη — παγίδα που έχει ήδη
     * πληρώσει το PLUI: ένας δέκτης του manifest ΧΩΡΙΣ `<intent-filter>` δεν ταιριάζει ποτέ σε
     * broadcast μόνο με action, και τότε το παράθυρο επιβεβαίωσης δεν ανοίγει ΠΟΤΕ — η εγκατάσταση
     * μένει για πάντα «σε εξέλιξη» χωρίς κανένα σφάλμα πουθενά.
     */
    private fun installSelf(apk: java.io.File) {
        val installer = context.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
        params.setAppPackageName(context.packageName)
        val sessionId = installer.createSession(params)
        installer.openSession(sessionId).use { session ->
            apk.inputStream().use { input ->
                session.openWrite("apk", 0, apk.length()).use { out ->
                    input.copyTo(out)
                    session.fsync(out)
                }
            }
            val intent = Intent(context, UpdateInstallReceiver::class.java).setAction(SELF_INSTALL_ACTION)
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
            val pi = PendingIntent.getBroadcast(context, sessionId, intent, flags)
            session.commit(pi.intentSender)
        }
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
     * ΓΙΑΤΙ ΔΕΝ ΤΑΞΙΔΕΥΕΙ ΠΙΑ API BYPASS SDK ΜΕΣΑ ΣΤΟ APK (2/10/2026).
     *
     * Το Kadb χρειάζεται TLSv1.3 για το pairing. Όπου η πλατφόρμα δεν το δίνει, πήγαινε να βρει την
     * ΚΡΥΦΗ Conscrypt του συστήματος μέσω `HiddenApiBypass` — και αυτό ακριβώς είναι το «unsupported
     * API» που μας επισήμανε το Play (release 8): το νέο Android Runtime, προεπιλογή στο Android 16,
     * δεν το ανέχεται, οπότε η εφαρμογή θα έσκαγε στη συσκευή του χρήστη.
     *
     * Η ίδια η βιβλιοθήκη όμως προτιμά τη ΔΗΜΟΣΙΑ Conscrypt όταν της πεις ότι υπάρχει (ο έλεγχος
     * είναι το πρώτο πράγμα που κάνει το `getConscryptClass`). Φέρνουμε λοιπόν το
     * `org.conscrypt:conscrypt-android` στο build και γυρίζουμε τον διακόπτη εδώ, μία φορά, πριν
     * από το πρώτο pairing: από εκεί και πέρα το bypass δεν καλείται ποτέ — και το excluded
     * dependency δεν υπάρχει καν μέσα στο APK για να το βρει το Play.
     *
     * Ιδεμποτέντ και αθόρυβο: αν για οποιονδήποτε λόγο λείπει η βιβλιοθήκη, αφήνουμε το Kadb να
     * κάνει ό,τι έκανε πάντα αντί να ρίξουμε το pairing.
     */
    private fun useBundledConscrypt() {
        if (conscryptReady) return
        try {
            // ΜΕ REFLECTION, ΓΙΑΤΙ ΤΟ KOTLIN ΤΟ ΚΛΕΙΔΩΝΕΙ: το `SslUtils` είναι `internal` στο Kadb,
            // άρα ο compiler δεν μας αφήνει να το γράψουμε με το όνομά του — στο bytecode όμως είναι
            // κανονικό public (`public final void setCustomConscrypt(boolean)`), οπότε η reflection
            // είναι απλή κλήση σε δημόσια μέθοδο. ΔΕΝ είναι non-SDK interface: ο κανόνας του Android
            // αφορά τα κρυφά API του ΣΥΣΤΗΜΑΤΟΣ, όχι τον κώδικα μιας βιβλιοθήκης μέσα στο ίδιο APK.
            // Τα ονόματα επιβιώνουν γιατί το release ΔΕΝ κάνει minify (build.gradle: minifyEnabled false).
            val cls = Class.forName("com.flyfishxu.kadb.pair.SslUtils")
            val instance = cls.getField("INSTANCE").get(null)
            cls.getMethod("setCustomConscrypt", Boolean::class.javaPrimitiveType).invoke(instance, true)
            conscryptReady = true
        } catch (e: Throwable) {
            Log.w("AdbSocket", "bundled Conscrypt unavailable, leaving Kadb's own path in place", e)
        }
    }

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
                useBundledConscrypt()
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
