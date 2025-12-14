import Bonjour from 'bonjour-service';
import { MDNS_SERVICE_TYPE, MDNS_DISCOVERY_TIMEOUT } from '@shared/constants';
import type { MdnsDevice } from '@shared/types';
import { logger } from '../utils/logger';

class DiscoveryService {
  private bonjour: any;

  constructor() {
    this.bonjour = new Bonjour();
  }

  /**
   * Scans the network for WLED devices
   * Returns array of discovered devices with IP addresses
   */
  async scan(timeout = MDNS_DISCOVERY_TIMEOUT): Promise<MdnsDevice[]> {
    return new Promise((resolve) => {
      const devices: MdnsDevice[] = [];
      const discoveredIps = new Set<string>();

      logger.info(`Starting mDNS discovery for WLED devices (${timeout}ms timeout)...`);

      // Browse for WLED services (_wled._tcp)
      const browser = this.bonjour.find({ type: 'wled' });

      browser.on('up', (service) => {
        logger.debug('mDNS service found:', {
          name: service.name,
          type: service.type,
          host: service.host,
          port: service.port,
          addresses: service.addresses,
        });

        // Extract IPv4 address
        const ipv4 = service.addresses?.find(addr =>
          /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(addr)
        );

        if (ipv4 && !discoveredIps.has(ipv4)) {
          discoveredIps.add(ipv4);

          const device: MdnsDevice = {
            name: service.name || service.host || 'Unknown WLED',
            ip: ipv4,
            port: service.port || 80,
            type: service.type,
          };

          logger.info('WLED device discovered:', device);
          devices.push(device);
        }
      });

      browser.on('error', (err) => {
        logger.error('mDNS browser error:', err);
      });

      // Stop scanning after timeout
      setTimeout(() => {
        browser.stop();
        logger.info(`Discovery complete: ${devices.length} WLED device(s) found`);
        if (devices.length === 0) {
          logger.warn('No WLED devices found via mDNS. Devices may not be advertising _wled._tcp service or may be on a different network subnet.');
        }
        resolve(devices);
      }, timeout);
    });
  }

  /**
   * Cleanup bonjour instance
   */
  destroy(): void {
    this.bonjour.destroy();
  }
}

export const discoveryService = new DiscoveryService();
