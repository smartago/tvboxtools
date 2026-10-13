package tv.launcher.manager

import android.annotation.SuppressLint
import android.content.Context
import android.util.Base64
import android.util.Log
import com.flyfishxu.kadb.cert.KadbCert
import com.flyfishxu.kadb.cert.KadbCertPolicy
import com.flyfishxu.kadb.cert.KadbIdentitySnapshot
import com.flyfishxu.kadb.cert.OkioFilePrivateKeyStore
import okio.Path.Companion.toPath
import org.bouncycastle.asn1.pkcs.PrivateKeyInfo
import org.bouncycastle.openssl.PEMKeyPair
import org.bouncycastle.openssl.PEMParser
import org.bouncycastle.openssl.jcajce.JcaPEMKeyConverter
import java.io.ByteArrayInputStream
import java.io.File
import java.io.StringReader
import java.net.Socket
import java.security.KeyFactory
import java.security.MessageDigest
import java.security.Principal
import java.security.PrivateKey
import java.security.cert.CertificateException
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.security.interfaces.RSAPublicKey
import java.security.spec.PKCS8EncodedKeySpec
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLEngine
import javax.net.ssl.X509ExtendedKeyManager
import javax.net.ssl.X509TrustManager

/**
 * The phone's ADB identity for Wireless debugging: ONE RSA-2048 key + self-signed X.509, generated
 * once and kept in app-private storage (files/adb/adbkey.pem), shared by pairing (Kadb sends its
 * public key as peer info) and by `startTls` (the same certificate is the TLS client cert). The
 * daemon compares the certificate's PUBLIC KEY with the keys it learned at pairing — the certificate
 * bytes themselves may be regenerated over the same key, that is fine.
 *
 * The classic :5555 path (RSA AUTH + "Allow" on the TV) uses Tango's own WebCrypto key in the
 * WebView instead; the TV may therefore list this phone twice, once per path. Harmless.
 */
internal object AdbIdentity {
    private const val TAG = "AdbIdentity"

    @Volatile
    private var configured = false

    fun ensure(context: Context): KadbIdentitySnapshot {
        synchronized(this) {
            if (!configured) {
                val dir = File(context.applicationContext.filesDir, "adb").apply { mkdirs() }
                KadbCert.configure(
                    store = OkioFilePrivateKeyStore(File(dir, "adbkey.pem").absolutePath.toPath()),
                    // adb's own certificate subject (adb/crypto/x509_generator.cpp): C=US, O=Android, CN=Adb
                    policy = KadbCertPolicy(subject = KadbCertPolicy.Subject(cn = "Adb", o = "Android", c = "US")),
                )
                configured = true
            }
        }
        return KadbCert.ensureReady()
    }

    /** TLS 1.3 client context: our identity as the client certificate, adbd's certificate checked by [AdbdTrustManager]. */
    fun sslContext(context: Context): SSLContext {
        val id = ensure(context)
        val key = parsePrivateKey(id.privateKeyPem)
        val cert = CertificateFactory.getInstance("X.509")
            .generateCertificate(ByteArrayInputStream(id.certificatePem)) as X509Certificate
        return SSLContext.getInstance("TLS").apply {
            init(arrayOf(IdentityKeyManager(key, arrayOf(cert))), arrayOf(AdbdTrustManager()), null)
        }
    }

    fun fingerprint(der: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(der).joinToString(":") { "%02X".format(it) }

    private fun parsePrivateKey(pem: ByteArray): PrivateKey {
        val text = String(pem, Charsets.US_ASCII)
        if (text.contains("BEGIN PRIVATE KEY")) {
            // PKCS#8 — the platform KeyFactory reads it, no BouncyCastle needed.
            val body = text.replace(Regex("-----[A-Z ]+-----"), "").replace(Regex("\\s"), "")
            return KeyFactory.getInstance("RSA").generatePrivate(PKCS8EncodedKeySpec(Base64.decode(body, Base64.DEFAULT)))
        }
        // PKCS#1 ("BEGIN RSA PRIVATE KEY") or anything else: BouncyCastle's PEM reader (bcpkix,
        // which Kadb already ships).
        PEMParser(StringReader(text)).use { parser ->
            return when (val obj = parser.readObject()) {
                is PEMKeyPair -> JcaPEMKeyConverter().getKeyPair(obj).private
                is PrivateKeyInfo -> JcaPEMKeyConverter().getPrivateKey(obj)
                else -> throw IllegalStateException("unsupported private key PEM (${obj?.javaClass?.simpleName})")
            }
        }
    }

    /** Presents our one identity for every client-auth request; never a server. */
    private class IdentityKeyManager(private val key: PrivateKey, private val chain: Array<X509Certificate>) : X509ExtendedKeyManager() {
        override fun chooseClientAlias(keyType: Array<out String>?, issuers: Array<out Principal>?, socket: Socket?) = ALIAS
        override fun chooseEngineClientAlias(keyType: Array<out String>?, issuers: Array<out Principal>?, engine: SSLEngine?) = ALIAS
        override fun getClientAliases(keyType: String?, issuers: Array<out Principal>?) = arrayOf(ALIAS)
        override fun getCertificateChain(alias: String?) = if (alias == ALIAS) chain else null
        override fun getPrivateKey(alias: String?) = if (alias == ALIAS) key else null
        override fun chooseServerAlias(keyType: String?, issuers: Array<out Principal>?, socket: Socket?): String? = null
        override fun getServerAliases(keyType: String?, issuers: Array<out Principal>?): Array<String>? = null

        companion object {
            const val ALIAS = "adb"
        }
    }

    /**
     * adbd's TLS server certificate is self-signed and generated by the daemon itself (a fresh key
     * per boot), so there is no authority to chain to and nothing stable to pin: the reference adb
     * client verifies NOTHING here (SSL_VERIFY_NONE) — the daemon is the one authenticating US.
     * This manager still insists on a well-formed adbd-style certificate (self-signed, its own
     * signature valid, RSA, currently valid) and rejects anything else, so a stray TLS server on
     * :5555 does not get an ADB handshake.
     */
    @SuppressLint("CustomX509TrustManager")
    private class AdbdTrustManager : X509TrustManager {
        override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) {
            throw CertificateException("client authentication is not expected on this side")
        }

        override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {
            val leaf = chain.firstOrNull() ?: throw CertificateException("the TV presented no certificate")
            if (leaf.subjectX500Principal != leaf.issuerX500Principal) {
                throw CertificateException("not a self-signed adbd certificate (issuer ${leaf.issuerX500Principal})")
            }
            try {
                leaf.verify(leaf.publicKey)
            } catch (e: Exception) {
                throw CertificateException("adbd certificate signature does not verify: ${e.message}")
            }
            if (leaf.publicKey !is RSAPublicKey) throw CertificateException("adbd certificate is not RSA")
            leaf.checkValidity()
            val subject = leaf.subjectX500Principal.name
            if (!subject.contains("CN=Adb")) Log.w(TAG, "unusual adbd certificate subject: $subject")
        }

        override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
    }
}
