/**
 * Parent-page bridge for widget lead events.
 *
 * Widgets run inside an iframe on our domain, so any dataLayer push made
 * inside them lands in the iframe's own dataLayer — the client's GTM
 * container (and their first-party cookies / Google click ID) live in the
 * parent page and never see it.
 *
 * This snippet is appended to every generated embed code. It listens for the
 * `jewlx-lead` postMessage sent by `conversion-tracking.ts` and re-pushes it
 * as a `jewlx_lead` event into the PARENT page's dataLayer, where the
 * client's own GTM tag can fire with full attribution.
 *
 * Hardening:
 *  - installs once per page even when several widgets are embedded, so one
 *    lead never produces duplicate dataLayer pushes (and duplicate Ads
 *    conversions);
 *  - only accepts a message whose source is an iframe actually present on
 *    the page, so an unrelated script or extension cannot inject fake leads;
 *  - de-duplicates repeated messages carrying the same lead id.
 */
export const LEAD_BRIDGE_SNIPPET = `<script>
(function(){
  if (window.__jewlxLeadBridge) return;
  window.__jewlxLeadBridge = true;
  var seen = {};
  function isWidgetFrame(source) {
    if (!source) return false;
    var frames = document.getElementsByTagName('iframe');
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].contentWindow === source) return true;
    }
    return false;
  }
  window.addEventListener('message', function(e) {
    var data;
    try { data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch(x) { return; }
    if (!data) return;
    if (!isWidgetFrame(e.source)) return;
    if (data.type === 'jewlx-event' && data.event) {
      var ev = { event: data.event };
      if (data.params) { for (var k in data.params) { if (Object.prototype.hasOwnProperty.call(data.params, k)) ev[k] = data.params[k]; } }
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(ev);
      return;
    }
    if (data.type !== 'jewlx-lead') return;
    if (data.lead_id) {
      if (seen[data.lead_id]) return;
      seen[data.lead_id] = true;
    }
    var payload = {
      event: typeof data.event_name === 'string' && data.event_name ? data.event_name : 'jewlx_lead',
      form_type: data.form_type,
      lead_id: data.lead_id,
      sha256_email_address: data.sha256_email_address,
      sha256_phone_number: data.sha256_phone_number
    };
    if (typeof data.value === 'number' && data.value > 0) {
      payload.value = data.value;
      payload.currency = data.currency;
    }
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(payload);
  });
})();
</script>`;
