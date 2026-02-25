import axios from "axios";
import { Registry, RegistryEntry } from "./types";

const REGISTRY_URL =
  "https://raw.githubusercontent.com/know-help/registry/main/packs.json";

/**
 * Fetch the pack registry from GitHub.
 */
export async function fetchRegistry(): Promise<Registry> {
  try {
    const response = await axios.get(REGISTRY_URL, { timeout: 10000 });
    return response.data;
  } catch {
    // Fallback to local registry
    return { packs: [] };
  }
}

/**
 * List packs, optionally filtered by category.
 */
export async function listPacks(
  category?: string
): Promise<RegistryEntry[]> {
  const registry = await fetchRegistry();
  let packs = registry.packs;

  if (category) {
    packs = packs.filter(
      (p) => p.category.toLowerCase() === category.toLowerCase()
    );
  }

  return packs;
}

/**
 * Find a specific pack by ID.
 */
export async function findPack(
  packId: string
): Promise<RegistryEntry | null> {
  const registry = await fetchRegistry();
  return registry.packs.find((p) => p.id === packId) || null;
}
