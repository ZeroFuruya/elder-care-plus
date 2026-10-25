/**
 * Realtime channel topics for the app's subscription hooks.
 *
 * `supabase.channel(topic)` does **not** create a channel: it returns the existing
 * channel registered for that topic when there is one, and `RealtimeChannel.on()`
 * then throws
 *
 *   cannot add `postgres_changes` callbacks for realtime:<topic> after `subscribe()`.
 *
 * because that instance is already subscribed. A fixed topic therefore breaks as soon
 * as a hook that owns it runs a second time inside one JS session — a shell layout
 * re-mounting, signing out and back in, or the router recreating a group. The throw
 * happens while React mounts the effect, so in a release build it is fatal: the app
 * closes with no message. (In Expo Go / a dev build it surfaces as a Render Error.)
 *
 * `removeChannel` in the cleanup does not save us: it is asynchronous, so a re-mount
 * can arrive while the previous channel is still registered.
 *
 * Give every subscription a topic no other subscription can hold instead.
 */

/** Salt of this module evaluation, so a Fast Refresh cannot repeat a previous topic. */
const sessionSalt = Math.random().toString(36).slice(2, 8);

let sequence = 0;

/**
 * A topic unique to this subscription. The prefix is kept for readable logs, so a
 * Supabase Realtime console still shows which feature a channel belongs to.
 */
export function uniqueRealtimeTopic(prefix: string): string {
  sequence += 1;
  return `${prefix}-${sessionSalt}-${sequence}`;
}
