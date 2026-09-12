import type { EquipmentType } from "@/lib/equipment";

export const CPU_MODEL_SUGGESTIONS = {
  AMD: {
    "Ryzen 3": ["3100", "4100", "5300G", "8300G"],
    "Ryzen 5": ["5600", "5600X", "7600", "7600X", "9600X"],
    "Ryzen 7": ["5700X", "5800X3D", "7700X", "7800X3D", "9700X"],
    "Ryzen 9": ["5900X", "5950X", "7900X", "7950X3D", "9950X"],
    Threadripper: ["7960X", "7970X", "7980X"],
    Other: [],
  },
  Intel: {
    "Core i3": ["12100", "13100", "14100"],
    "Core i5": ["12400", "13400", "13600K", "14400", "14600K"],
    "Core i7": ["12700K", "13700K", "14700K", "14700KF"],
    "Core i9": ["12900K", "13900K", "14900K"],
    "Core Ultra 5": ["225", "225F", "245K"],
    "Core Ultra 7": ["265", "265K"],
    "Core Ultra 9": ["285K"],
    Xeon: ["W3-2423", "W5-2455X", "W7-2495X"],
    Other: [],
  },
} as const;

export const GPU_MODEL_SUGGESTIONS = {
  NVIDIA: {
    "GeForce GTX": ["1650", "1660 Super"],
    "GeForce RTX": ["3060", "3070", "4060", "4070 Super", "4080 Super", "4090", "5070", "5080", "5090"],
    Professional: ["RTX A4000", "RTX A5000", "RTX 4000 Ada", "RTX 6000 Ada"],
    Other: [],
  },
  AMD: {
    "Radeon RX": ["6600", "6700 XT", "7600", "7800 XT", "7900 XTX", "9070 XT"],
    "Radeon Pro": ["W6600", "W6800", "W7800", "W7900"],
    Other: [],
  },
  Intel: { Arc: ["A380", "A750", "A770", "B570", "B580"], Other: [] },
  Other: { Other: [] },
} as const;

export function cpuModelSuggestions(manufacturer: keyof typeof CPU_MODEL_SUGGESTIONS, family: string | null) {
  const catalog: Readonly<Record<string, readonly string[]>> = CPU_MODEL_SUGGESTIONS[manufacturer];
  return family ? catalog[family] ?? [] : [];
}

export function gpuModelSuggestions(vendor: keyof typeof GPU_MODEL_SUGGESTIONS, family: string | null) {
  const catalog: Readonly<Record<string, readonly string[]>> = GPU_MODEL_SUGGESTIONS[vendor];
  return family ? catalog[family] ?? [] : [];
}

const MANUFACTURERS: Partial<Record<EquipmentType, readonly string[]>> = {
  laptop: ["Acer", "Apple", "ASUS", "Dell", "HP", "Lenovo", "Microsoft", "MSI"],
  monitor: ["AOC", "ASUS", "BenQ", "Dell", "LG", "Samsung"],
  mouse: ["Apple", "Dell", "Keychron", "Logitech", "Microsoft", "Razer"],
  keyboard: ["Apple", "Keychron", "Logitech", "Microsoft", "Razer"],
  headphones: ["Apple", "Bose", "Jabra", "Logitech", "Sennheiser", "Sony"],
  webcam: ["Dell", "Elgato", "Insta360", "Logitech", "Razer"],
  printer: ["Brother", "Canon", "Epson", "HP", "Kyocera", "Xerox"],
  air_conditioner: ["Cooper&Hunter", "Daikin", "Gree", "LG", "Mitsubishi Electric", "Samsung"],
  coffee_machine: ["De'Longhi", "Jura", "Krups", "Nespresso", "Philips", "Saeco"],
};

const MODELS: Partial<Record<EquipmentType, Record<string, readonly string[]>>> = {
  laptop: {
    Apple: ["MacBook Air 13", "MacBook Air 15", "MacBook Pro 14", "MacBook Pro 16"],
    Dell: ["Latitude 7450", "Precision 5690", "XPS 13", "XPS 16"],
    Lenovo: ["ThinkPad P1", "ThinkPad T14", "ThinkPad X1 Carbon", "Yoga Pro 9i"],
  },
  monitor: {
    Dell: ["P2425H", "U2723QE", "U3223QE"],
    LG: ["27UP850", "32UN880", "34WN80C"],
    Samsung: ["ViewFinity S8", "Odyssey G7"],
  },
  mouse: { Logitech: ["MX Anywhere 3S", "MX Master 3S", "Lift"] },
  keyboard: { Keychron: ["K2", "K8 Pro", "Q1 Max"], Logitech: ["MX Keys Mini", "MX Keys S"] },
  headphones: { Jabra: ["Evolve2 65", "Evolve2 85"], Sony: ["WH-1000XM4", "WH-1000XM5"] },
  webcam: { Logitech: ["Brio 4K", "Brio 500", "C920"] },
  printer: { Brother: ["DCP-L2660DW", "MFC-L8900CDW"], Epson: ["EcoTank L3250", "EcoTank L6270"], HP: ["LaserJet Pro 4003dn", "OfficeJet Pro 9120e"] },
  air_conditioner: { Daikin: ["Emura", "Perfera", "Stylish"], Gree: ["Amber", "Bora", "Pular"] },
  coffee_machine: { "De'Longhi": ["Dinamica", "Eletta Explore", "Magnifica Evo"], Philips: ["Series 2200", "Series 3200", "Series 5400"] },
};

export function equipmentManufacturerSuggestions(type: EquipmentType) {
  return MANUFACTURERS[type] ?? [];
}

export function equipmentModelSuggestions(type: EquipmentType, manufacturer: string) {
  const models = MODELS[type];
  const key = Object.keys(models ?? {}).find((value) => value.toLocaleLowerCase() === manufacturer.trim().toLocaleLowerCase());
  return key && models ? models[key] : [];
}
