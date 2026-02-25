export interface PackTheme {
  mode: "dark" | "light";
  accent: string;
  fonts?: {
    serif?: string;
    mono?: string;
  };
}

export interface PackManifest {
  id: string;
  name: string;
  author: string;
  version: string;
  description: string;
  category: string;
  tags: string[];
  price_usd: number;
  install_path: string;
  files: string[];
  merge_strategy: "replace" | "append" | "skip";
  theme?: PackTheme;
}

export interface RegistryEntry {
  id: string;
  name: string;
  author: string;
  version: string;
  description: string;
  category: string;
  tags: string[];
  price_usd: number;
  downloads: number;
  registry_url: string;
  theme?: PackTheme;
}

export interface Registry {
  packs: RegistryEntry[];
}

export interface InstalledPack {
  date: string;
  pack_id: string;
  pack_name: string;
  version: string;
  files_installed: string[];
  merge_strategy: string;
}
