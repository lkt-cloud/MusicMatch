import {
  CaretDown,
  CaretLeft,
  ChatCircle,
  ChatsCircle,
  CircleDashed,
  Crosshair,
  Disc,
  DotsThree,
  DownloadSimple,
  Faders,
  File,
  Globe,
  GlobeHemisphereWest,
  Headphones,
  Heart,
  Image,
  LinkSimple,
  MagnifyingGlass,
  MapPin,
  MapTrifold,
  Microphone,
  Minus,
  MusicNote,
  MusicNotes,
  NavigationArrow,
  PaperPlaneTilt,
  Paperclip,
  Pause,
  PencilSimple,
  Play,
  Plus,
  SpeakerHifi,
  SquaresFour,
  Star,
  Trash,
  User,
  UsersThree,
  VideoCamera,
  VinylRecord,
  X,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react';
import type { Role } from '../data/types';

// One icon set (Phosphor) so every glyph shares the same weight and proportions.
const ICONS = {
  map: MapTrifold,
  feed: UsersThree,
  chat: ChatsCircle,
  user: User,
  search: MagnifyingGlass,
  plus: Plus,
  minus: Minus,
  locate: Crosshair,
  globe: GlobeHemisphereWest,
  heart: Heart,
  comment: ChatCircle,
  send: PaperPlaneTilt,
  back: CaretLeft,
  close: X,
  star: Star,
  pin: MapPin,
  play: Play,
  edit: PencilSimple,
  chevron: CaretDown,
  link: LinkSimple,
  directions: NavigationArrow,
  radius: CircleDashed,
  trash: Trash,
  flat: Disc,
  sphere: Globe,
  image: Image,
  clip: Paperclip,
  more: DotsThree,
  download: DownloadSimple,
  pause: Pause,
  file: File,
  // Roles & music
  mic: Microphone,
  pads: SquaresFour,
  camera: VideoCamera,
  speaker: SpeakerHifi,
  levels: Faders,
  note: MusicNote,
  notes: MusicNotes,
  vinyl: VinylRecord,
  headphones: Headphones,
} satisfies Record<string, PhosphorIcon>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 20, filled = false }: { name: IconName; size?: number; filled?: boolean }) {
  const Glyph = ICONS[name];
  return <Glyph size={size} weight={filled ? 'fill' : 'regular'} aria-hidden />;
}

const ROLE_ICONS: Record<Role, IconName> = {
  artist: 'mic',
  producer: 'pads',
  videographer: 'camera',
  studio: 'speaker',
  engineer: 'levels',
};

export const roleIconName = (role: Role) => ROLE_ICONS[role];

export function RoleIcon({ role, size = 16 }: { role: Role; size?: number }) {
  return <Icon name={ROLE_ICONS[role]} size={size} />;
}
