import { describe, expect, it, vi } from 'vitest';
import { lanAddresses, openNetworkOn } from './tcpip.js';

// Αληθινή έξοδος `ip -o -4 addr show` από Android TV box (eth0 με καλώδιο, wlan0 ταυτόχρονα).
const IP_BOTH = [
  '1: lo    inet 127.0.0.1/8 scope host lo\\       valid_lft forever preferred_lft forever',
  '2: eth0    inet 192.168.1.151/24 brd 192.168.1.255 scope global eth0\\       valid_lft forever',
  '3: wlan0    inet 192.168.1.72/24 brd 192.168.1.255 scope global wlan0\\       valid_lft forever',
].join('\n');

describe('lanAddresses', () => {
  it('βάζει το ethernet ΠΡΙΝ από το wifi — η IP του καλωδίου δεν αλλάζει όταν ξυπνά το box', async () => {
    expect(await lanAddresses(async () => IP_BOTH)).toEqual(['192.168.1.151', '192.168.1.72']);
  });

  it('πετά loopback και ό,τι δεν είναι ιδιωτικό', async () => {
    const out = [
      '1: lo    inet 127.0.0.1/8 scope host lo',
      '2: eth0    inet 169.254.3.7/16 scope link eth0',
      '3: eth0    inet 100.115.92.2/30 scope global eth0',
      '4: wlan0    inet 10.0.0.44/24 scope global wlan0',
    ].join('\n');
    expect(await lanAddresses(async () => out)).toEqual(['10.0.0.44']);
  });

  it('παλιό box χωρίς `ip`: πέφτει στις ιδιότητες του dhcp', async () => {
    const shell = vi.fn(async (cmd: string) => {
      if (cmd.startsWith('ip ')) throw new Error('/system/bin/sh: ip: not found');
      if (cmd === 'getprop dhcp.eth0.ipaddress') return '192.168.1.151\n';
      return '\n';
    });
    expect(await lanAddresses(shell)).toEqual(['192.168.1.151']);
  });

  it('δεν βρέθηκε τίποτα: άδειο, όχι σκουπίδια', async () => {
    expect(await lanAddresses(async () => '')).toEqual([]);
  });
});

describe('openNetworkOn', () => {
  it('ΔΙΑΒΑΖΕΙ ΠΡΩΤΑ τις διευθύνσεις και μετά ρίχνει τον daemon — ανάποδα δεν θα υπήρχε σύνδεση', async () => {
    const order: string[] = [];
    const shell = async (cmd: string) => {
      order.push(`shell ${cmd.split(' ')[0]}`);
      return IP_BOTH;
    };
    const adb = {
      tcpip: {
        setPort: async (port: number) => {
          order.push(`setPort ${port}`);
          return 'restarting in TCP mode port: 5555';
        },
      },
    };
    const out = await openNetworkOn(adb as never, shell, 5555);
    expect(order).toEqual(['shell ip', 'setPort 5555']);
    expect(out).toEqual({ port: 5555, addresses: ['192.168.1.151', '192.168.1.72'] });
  });
});
