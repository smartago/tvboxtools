package tv.launcher.manager

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.util.Log

/**
 * Η ΑΠΑΝΤΗΣΗ ΤΟΥ PackageInstaller ΓΙΑ ΤΗΝ ΑΥΤΟ-ΕΝΗΜΕΡΩΣΗ. Αντιγραφή του `InstallResultReceiver`
 * του PLUI (`Premium-Launcher-UI-Kotlin`), που είναι ο δρόμος ΟΛΩΝ των sideload app μας.
 *
 * Η συνηθισμένη απάντηση είναι `STATUS_PENDING_USER_ACTION`: κουβαλά το ΔΙΚΟ ΤΟΥ ΣΥΣΤΗΜΑΤΟΣ
 * παράθυρο επιβεβαίωσης, και το μόνο που κάνουμε είναι να το ανοίξουμε. Επιτυχία σημαίνει ότι η
 * εφαρμογή αντικαθίσταται — δεν υπάρχει «μετά» να δείξουμε κάτι.
 */
class UpdateInstallReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, -1)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                @Suppress("DEPRECATION")
                val confirm = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
                confirm?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                runCatching { context.startActivity(confirm) }
                    .onFailure { Log.w("AdbSocket", "install confirm failed: $it") }
            }
            PackageInstaller.STATUS_SUCCESS -> Log.i("AdbSocket", "self-update installed")
            else -> Log.w("AdbSocket", "self-update failed ($status): " + intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE))
        }
    }
}
