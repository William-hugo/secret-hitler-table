// Shared icons and helpers for the TV and phone screens.
const ICON = {
  investigate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="10" cy="10" r="6"/><path d="M15 15l6 6"/></svg>',
  peek: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  special: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 21h16M6 21V11h12v10M9 11V7h6v4M12 7V3"/></svg>',
  execute: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/></svg>',
  veto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M6 6l12 12"/></svg>',
  crown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 18h18L19 7l-4 4-3-6-3 6-4-4z"/></svg>',
  gavel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 4l6 6M11 7l6 6M12.5 5.5l-5 5M18.5 11.5l-5 5M10 13l-7 7"/></svg>',
  skull: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 11a7 7 0 0 1 14 0v4h-3v4H8v-4H5z"/><circle cx="9.5" cy="11.5" r="1.5"/><circle cx="14.5" cy="11.5" r="1.5"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M5 12l5 5 9-10"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg>',
};
const ROLE_ART = { liberal: '/art/liberal.svg', fascist: '/art/fascist.svg', hitler: '/art/hitler.svg' };
const ROLE_NAME = { liberal: 'Liberal', fascist: 'Fascist', hitler: 'Hitler' };

function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function policyCard(p, extra = '') {
  const lib = p === 'L';
  return `<div class="policy ${lib ? 'lib' : 'fas'} ${extra}">
    <img src="${lib ? ROLE_ART.liberal : ROLE_ART.fascist}" alt="">
    <span>${lib ? 'Liberal' : 'Fascist'}</span><small>article</small></div>`;
}
