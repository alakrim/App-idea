import {
  Anchor,
  Atom,
  Bell,
  Bird,
  Bomb,
  Briefcase,
  Bug,
  Building,
  Building2,
  Castle,
  Church,
  Clock,
  CloudDrizzle,
  CloudLightning,
  CloudRain,
  CloudSnow,
  Coffee,
  Cog,
  Crosshair,
  DoorClosed,
  Droplet,
  Droplets,
  Drum,
  Flame,
  Footprints,
  Ghost,
  HeartPulse,
  Hospital,
  Landmark,
  Library,
  Lock,
  Moon,
  Mountain,
  Music,
  Plane,
  Rocket,
  Route,
  Satellite,
  School,
  Ship,
  Skull,
  Snowflake,
  Sparkle,
  Sparkles,
  Store,
  Sword,
  Swords,
  Target,
  Telescope,
  TrainFront,
  Trophy,
  Users,
  Utensils,
  WandSparkles,
  Waves,
  Waypoints,
  Wind,
  Wine,
  Zap,
} from 'lucide-react-native';

import { getCategory, type AmbienceIconName } from '@/core/analysis/ambience-taxonomy';
import type { LucideIcon } from 'lucide-react-native';

/**
 * The component for each ambience icon name. Typed over every name in the taxonomy, so adding a
 * category icon without mapping it here fails the typecheck.
 */
export const AMBIENCE_ICONS: Readonly<Record<AmbienceIconName, LucideIcon>> = {
  Anchor,
  Atom,
  Bell,
  Bird,
  Bomb,
  Briefcase,
  Bug,
  Building,
  Building2,
  Castle,
  Church,
  Clock,
  CloudDrizzle,
  CloudLightning,
  CloudRain,
  CloudSnow,
  Coffee,
  Cog,
  Crosshair,
  DoorClosed,
  Droplet,
  Droplets,
  Drum,
  Flame,
  Footprints,
  Ghost,
  HeartPulse,
  Hospital,
  Landmark,
  Library,
  Lock,
  Moon,
  Mountain,
  Music,
  Plane,
  Rocket,
  Route,
  Satellite,
  School,
  Ship,
  Skull,
  Snowflake,
  Sparkle,
  Sparkles,
  Store,
  Sword,
  Swords,
  Target,
  Telescope,
  TrainFront,
  Trophy,
  Users,
  Utensils,
  WandSparkles,
  Waves,
  Waypoints,
  Wind,
  Wine,
  Zap,
};

/** The icon for an ambience category. Unknown ids get the generic sparkle. */
export function ambienceIconOf(categoryId: string): LucideIcon {
  const category = getCategory(categoryId);
  return category ? AMBIENCE_ICONS[category.icon] : Sparkles;
}

/**
 * Ambience category ids to words, for an id the taxonomy does not know. Known ids use their
 * taxonomy label, so "tavern_crowd" reads "Tavern". The ids are stable and stored, so only the
 * display text changes here.
 */
export function humanizeCategory(categoryId: string): string {
  const words = categoryId
    .split('_')
    .filter((word) => word.length > 0)
    .join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The display name for a category: its taxonomy label, or a humanized id when unknown. */
export function ambienceLabel(categoryId: string): string {
  return getCategory(categoryId)?.label ?? humanizeCategory(categoryId);
}
