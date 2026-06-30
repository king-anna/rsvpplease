// Default message copy (server-side mirror of the front-end defaults) plus a
// merge helper so an event's saved templates override these per field.

export interface TemplateData {
  sms: { invite: string; nudge: string; replyYes: string; replyNo: string };
  email: {
    invite: { subject: string; body: string };
    nudge: { subject: string; body: string };
    replyYes: { subject: string; body: string };
    replyNo: { subject: string; body: string };
  };
}

export const DEFAULTS: TemplateData = {
  sms: {
    invite:
      "Hi {{guest_name}}! 💌 You're invited to {{event_name}} on {{date}}. " +
      "Tap to RSVP: {{rsvp_link}} — or just reply YES or NO. Hope you can make it!",
    nudge:
      "Hi {{guest_name}}, a gentle nudge about {{event_name}} on {{date}} — " +
      "we'd love to know if you can come! RSVP: {{rsvp_link}} (or reply YES/NO).",
    replyYes:
      "Yay! 🎉 So happy you'll be joining {{event_name}}, {{guest_name}}. " +
      "We'll send details closer to {{date}}. See you there!",
    replyNo:
      "Thanks for letting us know, {{guest_name}}. We'll miss you at {{event_name}}, " +
      "but completely understand. 💕",
  },
  email: {
    invite: {
      subject: "You're invited to {{event_name}} 💌",
      body:
        "Hi {{guest_name}},\n\n{{host_name}} would love to see you at {{event_name}} " +
        "on {{date}} at {{location}}.\n\nRSVP here: {{rsvp_link}}\n\nHope you can make it!",
    },
    nudge: {
      subject: "Still hoping you can make {{event_name}}",
      body:
        "Hi {{guest_name}},\n\nJust a gentle nudge about {{event_name}} on {{date}}. " +
        "Could you let us know if you can come? RSVP here: {{rsvp_link}}",
    },
    replyYes: {
      subject: "You're on the list for {{event_name}}! 🎉",
      body:
        "Yay {{guest_name}}! We can't wait to celebrate {{event_name}} with you " +
        "on {{date}}. We'll be in touch with details.",
    },
    replyNo: {
      subject: "Thanks for letting us know",
      body:
        "Thanks {{guest_name}} — we'll miss you at {{event_name}}, but completely " +
        "understand. 💕",
    },
  },
};

// Deep-merge a saved jsonb blob over the defaults (saved values win when set).
export function mergeDefaults(saved: unknown): TemplateData {
  const s = (saved || {}) as Partial<TemplateData>;
  return {
    sms: { ...DEFAULTS.sms, ...(s.sms || {}) },
    email: {
      invite: { ...DEFAULTS.email.invite, ...(s.email?.invite || {}) },
      nudge: { ...DEFAULTS.email.nudge, ...(s.email?.nudge || {}) },
      replyYes: { ...DEFAULTS.email.replyYes, ...(s.email?.replyYes || {}) },
      replyNo: { ...DEFAULTS.email.replyNo, ...(s.email?.replyNo || {}) },
    },
  };
}
