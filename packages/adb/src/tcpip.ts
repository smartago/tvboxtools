// «Άνοιξε και το δίκτυο»: `adb tcpip <port>` πάνω στο ίδιο το κουτί, μοιρασμένο από όσα transports
// κρατούν ένα Tango `Adb` (USB και TCP στον desktop/CLI, WebUSB, adb-server, και η όψη Android).
//
// ΓΙΑΤΙ ΥΠΑΡΧΕΙ (2/10/2026, Android 7 box του Jim): στα παλιά box ο διακόπτης «Network debugging»
// συχνά ΔΕΝ ΥΠΑΡΧΕΙ. Το adbd όμως ακούει στο δίκτυο μόλις του το ζητήσεις — και αυτό γίνεται μόνο
// από μια σύνδεση που ήδη έχεις, δηλαδή από το καλώδιο. Μία φορά με USB, για πάντα ασύρματα.
import type { Adb } from '@yume-chan/adb';
import type { OpenNetworkResult } from './index.js';

type Shell = (cmd: string) => Promise<string>;

/** Μόνο ιδιωτικές IPv4 — το 127.x και τα link-local δεν οδηγούν πουθενά. */
const PRIVATE = /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)\d/;

/**
 * Οι διευθύνσεις του κουτιού στο τοπικό δίκτυο, με ΣΕΙΡΑ: ethernet πριν από wifi. Το καλώδιο δεν
 * αλλάζει IP όταν ξυπνά το box, οπότε είναι η διεύθυνση που αξίζει να δείξεις στον άνθρωπο.
 */
export async function lanAddresses(shell: Shell): Promise<string[]> {
  const eth: string[] = [];
  const other: string[] = [];
  const add = (iface: string, ip: string) => {
    if (!PRIVATE.test(ip)) return;
    const list = /^(?:eth|usb)/.test(iface) ? eth : other;
    if (!eth.includes(ip) && !other.includes(ip)) list.push(ip);
  };
  try {
    // `ip` είναι toybox από Android 6· το -o βάζει μία διεπαφή ανά γραμμή.
    for (const line of (await shell('ip -o -4 addr show')).split('\n')) {
      const m = /^\s*\d+:\s*(\S+)\s+inet\s+(\d+\.\d+\.\d+\.\d+)/.exec(line);
      if (m?.[1] && m[2]) add(m[1], m[2]);
    }
  } catch {
    // πολύ παλιό box χωρίς `ip`: μένουν οι ιδιότητες του dhcp παρακάτω
  }
  if (!eth.length && !other.length) {
    for (const iface of ['eth0', 'wlan0', 'eth1', 'wlan1']) {
      try {
        const ip = (await shell(`getprop dhcp.${iface}.ipaddress`)).trim();
        if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) add(iface, ip);
      } catch {
        // η ιδιότητα δεν υπάρχει — δοκίμασε την επόμενη διεπαφή
      }
    }
  }
  return [...eth, ...other];
}

/**
 * Διαβάζει ΠΡΩΤΑ τις διευθύνσεις και ΜΕΤΑ ζητά το tcpip — με την αντίστροφη σειρά ο daemon έχει ήδη
 * πέσει και δεν υπάρχει πια σύνδεση για να ρωτήσεις πού απαντά.
 */
export async function openNetworkOn(adb: Adb, shell: Shell, port = 5555): Promise<OpenNetworkResult> {
  const addresses = await lanAddresses(shell);
  await adb.tcpip.setPort(port);
  return { port, addresses };
}
