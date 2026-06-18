import { supabase } from "@/integrations/supabase/client";

/**
 * Lager en realtime-kanal med et garantert unikt navn per mount.
 * Forhindrer "cannot add postgres_changes callbacks" feilen fra
 * @supabase/realtime-js >=2.11 ved kollisjon mellom mount/unmount-sykluser.
 *
 * Brukes KUN for postgres_changes-kanaler.
 * IKKE bruk for broadcast- eller presence-kanaler — de krever felles
 * kanalnavn på tvers av klienter.
 */
export function createUniqueChannel(baseName: string) {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return supabase.channel(`${baseName}-${suffix}`);
}
