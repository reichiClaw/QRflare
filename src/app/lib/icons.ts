import { createElement } from 'react';
import {
  AtSign,
  Bitcoin,
  Braces,
  CalendarDays,
  Contact,
  FileJson,
  Hexagon,
  IdCard,
  KeyRound,
  Landmark,
  Link,
  Mail,
  MapPin,
  MessageCircle,
  MessageSquare,
  Phone,
  QrCode,
  Smartphone,
  Terminal,
  Type,
  Wifi,
  type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  AtSign,
  Bitcoin,
  Braces,
  CalendarDays,
  Contact,
  FileJson,
  Hexagon,
  IdCard,
  KeyRound,
  Landmark,
  Link,
  Mail,
  MapPin,
  MessageCircle,
  MessageSquare,
  Phone,
  Smartphone,
  Terminal,
  Type,
  Wifi,
};

export function iconFor(name: string): LucideIcon {
  return ICONS[name] ?? QrCode;
}

/** Renders the Lucide icon registered under `name` without creating components during render. */
export function TypeIcon({ name, size = 16 }: { name: string; size?: number }) {
  return createElement(iconFor(name), { size, 'aria-hidden': true });
}
