package tv.launcher.manager

import android.os.Bundle
import android.view.KeyEvent
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // The only native piece of the app (DESIGN_NOTES §13): raw sockets + Wireless-debugging
        // pairing for Tango, which speaks the ADB protocol in JS.
        registerPlugin(AdbSocketPlugin::class.java)
        super.onCreate(savedInstanceState)
    }

    /**
     * The remote. Intercepted here and not in `onKeyDown`, because the WebView is a child view and
     * eats both of these keys before the activity ever sees them (measured on an Android TV 14
     * emulator: the ring moved with the arrows, but the centre key did nothing at all).
     *
     * CENTER / gamepad A — the arrows already arrive in the page as ArrowUp/Down/Left/Right, but
     * the centre key does not become a click on the focused element, so a selection could never be
     * made with a remote. Clicking `document.activeElement` is what a browser would have done.
     * ENTER is deliberately NOT intercepted: the WebView handles it natively and typing in the
     * manual-IP field must keep working.
     *
     * BACK — the wizard has its own idea of "back", so the page decides: `window.__tvlmBack()`
     * returns true when it consumed the press (closed a guide, stepped back) and false when there
     * is nowhere left to go, and only then does the app close, the way a TV viewer expects. The
     * answer is asynchronous, so the key is always reported as handled and the exit happens in the
     * callback.
     */
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val webView = bridge?.webView
        if (webView == null || event.action != KeyEvent.ACTION_DOWN) {
            // still swallow the matching ACTION_UP of the keys we handle, or the WebView sees half a press
            return if (webView != null && event.action == KeyEvent.ACTION_UP && isHandled(event.keyCode)) true
            else super.dispatchKeyEvent(event)
        }
        when (event.keyCode) {
            KeyEvent.KEYCODE_BACK -> {
                if (event.repeatCount == 0) {
                    webView.evaluateJavascript("(function(){try{return !!(window.__tvlmBack&&window.__tvlmBack())}catch(e){return false}})()") { result ->
                        if (result != "true") finish()
                    }
                }
                return true
            }
            KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_BUTTON_A -> {
                if (event.repeatCount == 0) {
                    webView.evaluateJavascript(
                        "(function(){var e=document.activeElement;" +
                            "if(e&&typeof e.click==='function'&&e.tagName!=='INPUT'&&e.tagName!=='TEXTAREA'){e.click();return true}" +
                            "return false})()",
                        null,
                    )
                }
                return true
            }
            else -> return super.dispatchKeyEvent(event)
        }
    }

    private fun isHandled(keyCode: Int): Boolean =
        keyCode == KeyEvent.KEYCODE_BACK || keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_BUTTON_A
}
