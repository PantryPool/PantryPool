/**
 * PantryPool Avatar Theme & Generator System
 *
 * Provides organic, warm Scandinavian breakroom/pantry aesthetic avatars
 * matching the brand palette (#FAFAF8, #F0EBE3, #E8694A, #3F5E4D, #2D2D2D).
 */

const WARM_PALETTES = 'f0ebe3,faede8,e8ded4,e3ebe6,fdf4e8';

/**
 * Generates an on-brand, warm modern vector portrait avatar URL for a given name/seed.
 */
export function getDefaultAvatarUrl(name?: string): string {
  const seed = (name && name.trim()) ? name.trim() : 'Member';
  return `https://api.dicebear.com/7.x/lorelei/svg?seed=${encodeURIComponent(seed)}&backgroundColor=${WARM_PALETTES}`;
}

export interface PresetAvatar {
  id: string;
  name: string;
  category: 'portraits' | 'monograms' | 'vibes';
  url: string;
}

export const PRESET_AVATARS: PresetAvatar[] = [
  // Breakroom & Pantry Personas (Warm Lorelei Portraits)
  { id: 'p_espresso', name: 'Espresso', category: 'portraits', url: 'https://api.dicebear.com/7.x/lorelei/svg?seed=Espresso&backgroundColor=f0ebe3' },
  { id: 'p_chai', name: 'Chai', category: 'portraits', url: 'https://api.dicebear.com/7.x/lorelei/svg?seed=Chai&backgroundColor=faede8' },
  { id: 'p_matcha', name: 'Matcha', category: 'portraits', url: 'https://api.dicebear.com/7.x/lorelei/svg?seed=Matcha&backgroundColor=e3ebe6' },
  { id: 'p_croissant', name: 'Croissant', category: 'portraits', url: 'https://api.dicebear.com/7.x/lorelei/svg?seed=Croissant&backgroundColor=fdf4e8' },
  { id: 'p_hazelnut', name: 'Hazelnut', category: 'portraits', url: 'https://api.dicebear.com/7.x/lorelei/svg?seed=Hazelnut&backgroundColor=e8ded4' },
  { id: 'p_sourdough', name: 'Sourdough', category: 'portraits', url: 'https://api.dicebear.com/7.x/lorelei/svg?seed=Sourdough&backgroundColor=f5efe6' },
  { id: 'p_caramel', name: 'Caramel', category: 'portraits', url: 'https://api.dicebear.com/7.x/lorelei/svg?seed=Caramel&backgroundColor=faede8' },
  { id: 'p_sage', name: 'Sage', category: 'portraits', url: 'https://api.dicebear.com/7.x/lorelei/svg?seed=Sage&backgroundColor=e3ebe6' },

  // Artisan Monograms (Brand Color Initials)
  { id: 'm_terracotta', name: 'Terracotta Classic', category: 'monograms', url: 'https://api.dicebear.com/7.x/initials/svg?seed=PP&backgroundColor=e8694a&textColor=ffffff' },
  { id: 'm_clay', name: 'Warm Clay', category: 'monograms', url: 'https://api.dicebear.com/7.x/initials/svg?seed=CL&backgroundColor=d46238&textColor=ffffff' },
  { id: 'm_sage', name: 'Forest Sage', category: 'monograms', url: 'https://api.dicebear.com/7.x/initials/svg?seed=FS&backgroundColor=3f5e4d&textColor=ffffff' },
  { id: 'm_espresso', name: 'Espresso Roast', category: 'monograms', url: 'https://api.dicebear.com/7.x/initials/svg?seed=ER&backgroundColor=2d2d2d&textColor=ffffff' },
  { id: 'm_almond', name: 'Roasted Almond', category: 'monograms', url: 'https://api.dicebear.com/7.x/initials/svg?seed=RA&backgroundColor=b56d3b&textColor=ffffff' },
  { id: 'm_sand', name: 'Warm Sand', category: 'monograms', url: 'https://api.dicebear.com/7.x/initials/svg?seed=WS&backgroundColor=8c5847&textColor=ffffff' },

  // Cozy Breakroom Doodles
  { id: 'v_sunny', name: 'Sunny Morning', category: 'vibes', url: 'https://api.dicebear.com/7.x/thumbs/svg?seed=SunnyBreakroom&backgroundColor=faede8' },
  { id: 'v_brew', name: 'Fresh Brew', category: 'vibes', url: 'https://api.dicebear.com/7.x/thumbs/svg?seed=MorningBrew&backgroundColor=f0ebe3' },
  { id: 'v_matcha', name: 'Matcha Break', category: 'vibes', url: 'https://api.dicebear.com/7.x/thumbs/svg?seed=MatchaMoment&backgroundColor=e3ebe6' },
  { id: 'v_tea', name: 'Afternoon Tea', category: 'vibes', url: 'https://api.dicebear.com/7.x/thumbs/svg?seed=CozyTea&backgroundColor=fdf4e8' }
];
