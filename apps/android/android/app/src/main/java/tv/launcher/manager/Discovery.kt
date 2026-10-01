package tv.launcher.manager

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import android.util.Log
import java.net.Inet4Address
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Socket
import java.util.Collections
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

/**
 * Finding boxes on the Wi-Fi, two ways at once:
 *  - a TCP connect scan of the /24 on the ADB port (300 ms per host, 64 in parallel — the whole
 *    /24 takes ~1.5 s). Catches boxes with "ADB debugging (network)" / `adb tcpip 5555`.
 *  - an mDNS browse with NsdManager for `_adb-tls-connect._tcp` (Android 11+ Wireless debugging:
 *    random port, TLS, needs pairing), `_adb-tls-pairing._tcp` (the pairing dialog is open on the
 *    TV — its host:port is what `pair` wants) and `_adb._tcp`.
 * Results are deduplicated by host:port; the mDNS entry wins because it carries the service name.
 */
internal class Discovery(private val context: Context) {
    data class Host(val host: String, val port: Int, val source: String, val service: String?, val name: String?)
    data class Result(val hosts: List<Host>, val subnet: String?)

    fun run(subnetArg: String?, port: Int, timeoutMs: Int, scan: Boolean, mdns: Boolean): Result {
        val found = Collections.synchronizedList(mutableListOf<Host>())
        val subnet = subnetArg?.takeIf { it.isNotBlank() } ?: localSubnet()
        val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
        val lock = runCatching {
            wifi?.createMulticastLock("tvlm-mdns")?.apply {
                setReferenceCounted(false)
                acquire()
            }
        }.getOrNull()
        try {
            val browser = if (mdns) thread(name = "tvlm-mdns") { browse(timeoutMs, found) } else null
            if (scan && subnet != null) scanSubnet(subnet, port, found)
            if (scan) probeSelf(port, found)
            browser?.join(timeoutMs + 5000L)
        } finally {
            runCatching { lock?.release() }
        }
        val byKey = LinkedHashMap<String, Host>()
        // mDNS first so the named entry is the one kept
        for (h in found.sortedBy { if (it.source == "mdns") 0 else 1 }) byKey.putIfAbsent("${h.host}:${h.port}", h)
        return Result(byKey.values.toList(), subnet)
    }

    /**
     * The daemon on THIS device. The subnet scan skips our own address on purpose — a phone has no
     * reason to scan itself — but when the box being set up IS this television, the local daemon is
     * the whole point. Loopback is the honest way to reach it: it is the same adbd either way, and
     * no packet has to leave the set.
     */
    private fun probeSelf(port: Int, out: MutableList<Host>) {
        try {
            Socket().use { s ->
                s.connect(InetSocketAddress("127.0.0.1", port), 300)
                out.add(Host("127.0.0.1", port, "self", null, null))
            }
        } catch (_: Exception) {
            // nothing listening: debugging is off, or this Android only offers wireless debugging
        }
    }

    // ------------------------------------------------------------------ TCP scan

    private fun scanSubnet(subnet: String, port: Int, out: MutableList<Host>) {
        val cidr = parseCidr(subnet) ?: return
        // Never more than a /22 (1022 hosts): a /16 would take minutes and hit the Wi-Fi hard.
        val prefix = cidr.second.coerceIn(22, 30)
        val mask = -1 shl (32 - prefix)
        val base = cidr.first and mask
        val size = 1 shl (32 - prefix)
        val self = localIPv4()?.let { toInt(it) }
        val pool = Executors.newFixedThreadPool(64)
        for (i in 1 until size - 1) {
            val ip = base or i
            if (ip == self) continue
            pool.execute {
                try {
                    Socket().use { s ->
                        s.connect(InetSocketAddress(toAddress(ip), port), 300)
                        out.add(Host(toAddress(ip).hostAddress ?: return@use, port, "scan", null, null))
                    }
                } catch (_: Exception) {
                    // nothing there
                }
            }
        }
        pool.shutdown()
        pool.awaitTermination(30, TimeUnit.SECONDS)
    }

    // ------------------------------------------------------------------ mDNS

    @Suppress("DEPRECATION")
    private fun browse(timeoutMs: Int, out: MutableList<Host>) {
        val nsd = context.applicationContext.getSystemService(Context.NSD_SERVICE) as? NsdManager ?: return
        val queue = LinkedBlockingQueue<NsdServiceInfo>()
        val listeners = SERVICE_TYPES.map { type ->
            val l = object : NsdManager.DiscoveryListener {
                override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
                    Log.w(TAG, "mDNS start failed for $serviceType: $errorCode")
                }
                override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {}
                override fun onDiscoveryStarted(serviceType: String) {}
                override fun onDiscoveryStopped(serviceType: String) {}
                override fun onServiceFound(info: NsdServiceInfo) { queue.add(info) }
                override fun onServiceLost(info: NsdServiceInfo) {}
            }
            runCatching { nsd.discoverServices(type, NsdManager.PROTOCOL_DNS_SD, l) }
                .onFailure { Log.w(TAG, "discoverServices($type): ${it.message}") }
            l
        }
        // NsdManager resolves ONE service at a time (a second concurrent resolve fails with
        // FAILURE_ALREADY_ACTIVE), so found services queue up and resolve in series.
        val deadline = System.currentTimeMillis() + timeoutMs + 1500
        val resolver = thread(name = "tvlm-mdns-resolve") {
            while (true) {
                val remaining = deadline - System.currentTimeMillis()
                if (remaining <= 0) break
                val info = queue.poll(remaining, TimeUnit.MILLISECONDS) ?: break
                val done = CountDownLatch(1)
                nsd.resolveService(info, object : NsdManager.ResolveListener {
                    override fun onResolveFailed(si: NsdServiceInfo, errorCode: Int) { done.countDown() }
                    override fun onServiceResolved(si: NsdServiceInfo) {
                        val addr = si.host
                        val host = (addr as? Inet4Address)?.hostAddress ?: addr?.hostAddress
                        if (host != null && si.port > 0) {
                            out.add(Host(host, si.port, "mdns", serviceOf(si.serviceType), si.serviceName))
                        }
                        done.countDown()
                    }
                })
                done.await(3, TimeUnit.SECONDS)
            }
        }
        try {
            Thread.sleep(timeoutMs.toLong())
        } catch (_: InterruptedException) {
        }
        listeners.forEach { runCatching { nsd.stopServiceDiscovery(it) } }
        resolver.join(3000)
    }

    /** "_adb-tls-connect._tcp." / "._adb-tls-connect._tcp" → "adb-tls-connect" */
    private fun serviceOf(type: String?): String? {
        val t = type?.trim('.') ?: return null
        return when {
            t.startsWith("_adb-tls-connect") -> "adb-tls-connect"
            t.startsWith("_adb-tls-pairing") -> "adb-tls-pairing"
            t.startsWith("_adb.") || t == "_adb._tcp" -> "adb"
            else -> t
        }
    }

    // ------------------------------------------------------------------ addresses

    @Suppress("DEPRECATION")
    private fun localIPv4(): Inet4Address? {
        val cm = context.applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return null
        fun ipv4Of(net: android.net.Network?): Inet4Address? {
            val lp = net?.let { cm.getLinkProperties(it) } ?: return null
            return lp.linkAddresses.map { it.address }.filterIsInstance<Inet4Address>().firstOrNull { !it.isLoopbackAddress }
        }
        // Prefer the Wi-Fi network (the phone may route "active" through mobile data).
        val wifiNet = cm.allNetworks.firstOrNull { n ->
            cm.getNetworkCapabilities(n)?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true
        }
        return ipv4Of(wifiNet) ?: ipv4Of(cm.activeNetwork)
    }

    /**
     * Every IPv4 this device answers on. The scan finds our own adbd (a TV running the tool sees
     * itself), and the UI needs to say so rather than offer the viewer an anonymous address.
     */
    fun localAddresses(): List<String> {
        val out = LinkedHashSet<String>()
        runCatching {
            for (nif in java.net.NetworkInterface.getNetworkInterfaces()) {
                if (!nif.isUp) continue
                for (addr in nif.inetAddresses) {
                    if (addr is Inet4Address && !addr.isLoopbackAddress && !addr.isLinkLocalAddress) {
                        addr.hostAddress?.let { out.add(it) }
                    }
                }
            }
        }
        localIPv4()?.hostAddress?.let { out.add(it) }
        return out.toList()
    }

    /** The /24 around our own address — a /16 Wi-Fi is scanned only near us. */
    private fun localSubnet(): String? {
        val ip = localIPv4() ?: return null
        val base = toInt(ip) and -256
        return "${toAddress(base).hostAddress}/24"
    }

    private fun parseCidr(s: String): Pair<Int, Int>? {
        val parts = s.trim().split('/')
        val addr = runCatching { InetAddress.getByName(parts[0]) as? Inet4Address }.getOrNull() ?: return null
        val prefix = parts.getOrNull(1)?.toIntOrNull() ?: 24
        return toInt(addr) to prefix.coerceIn(8, 30)
    }

    private fun toInt(a: Inet4Address): Int {
        val b = a.address
        return ((b[0].toInt() and 0xff) shl 24) or ((b[1].toInt() and 0xff) shl 16) or ((b[2].toInt() and 0xff) shl 8) or (b[3].toInt() and 0xff)
    }

    private fun toAddress(i: Int): Inet4Address =
        InetAddress.getByAddress(byteArrayOf((i ushr 24).toByte(), (i ushr 16).toByte(), (i ushr 8).toByte(), i.toByte())) as Inet4Address

    private companion object {
        const val TAG = "AdbDiscovery"
        val SERVICE_TYPES = listOf("_adb-tls-connect._tcp", "_adb-tls-pairing._tcp", "_adb._tcp")
    }
}
