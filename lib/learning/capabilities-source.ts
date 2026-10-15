import 'server-only';

import { cache } from 'react';

import { getPrivatePasReader } from '@/lib/private-pas/source';
import {
  initialDiscoveries,
  inventoryUpdatedAt,
  projectCapabilityData,
  validCapabilityDataset,
  type CapabilityLibraryRead,
} from '@/lib/learning/capabilities-model';

const INVENTORY_PATH = 'AI/knowledge/personal/generalist-competence-inventory.json';
const CARDS_PATH = 'AI/knowledge/personal/GENERALIST_CAPABILITY_CARDS_V1.json';
const TIME_PATH = 'AI/knowledge/personal/GENERALIST_TIME_ESTIMATES_V1.json';
const ROUTING_PATH = 'AI/knowledge/personal/GENERALIST_ENGINE_ROUTING_V1.json';

export type { CapabilityItem, CapabilityLibraryRead } from '@/lib/learning/capabilities-model';

async function loadCapabilityLibrary(): Promise<CapabilityLibraryRead> {
  const reader = getPrivatePasReader();
  if (!reader) {
    return {
      status: 'unconfigured',
      items: [],
      initialIds: [],
      updated: null,
      sourceCommit: null,
      notice: 'La biblioteca privada todavía no está conectada en este entorno.',
    };
  }
  try {
    const [sourceCommit, inventory, cards, times, routing] = await Promise.all([
      reader.sourceCommit(),
      reader.readJson(INVENTORY_PATH),
      reader.readJson(CARDS_PATH),
      reader.readJson(TIME_PATH),
      reader.readJson(ROUTING_PATH),
    ]);
    if (!validCapabilityDataset(inventory, cards, times, routing)) {
      return {
        status: 'invalid',
        items: [],
        initialIds: [],
        updated: null,
        sourceCommit,
        notice: 'Los datos privados no superaron la validación de integridad.',
      };
    }
    const items = projectCapabilityData(inventory, cards, times, routing);
    return {
      status: 'ready',
      items,
      initialIds: initialDiscoveries(items),
      updated: inventoryUpdatedAt(inventory),
      sourceCommit,
      notice: null,
    };
  } catch {
    return {
      status: 'unavailable',
      items: [],
      initialIds: [],
      updated: null,
      sourceCommit: null,
      notice: 'No se pudo leer la biblioteca privada.',
    };
  }
}

export const getCapabilityLibrary = cache(loadCapabilityLibrary);
