/**
 * The floating contact widget: one bubble, bottom-right, that expands into a
 * menu of three actions.
 *
 *   1. Send Us a Message — the option carries `data-lead-open`, so the existing
 *      lead-form module opens the site-wide modal exactly as every other
 *      "Get a Quote" button does. Nothing about form submission changes here.
 *   2. Direct Message   — opens the Tigon DMS chat plugin.
 *   3. Call Now         — a plain tel: link.
 *
 * The chat plugin (loaded async from S3, see script/lib/layout.ts) renders its
 * own launcher bubble inside an open shadow root on #chat-plugin-host. That
 * launcher is hidden with a stylesheet injected into the shadow root, and the
 * plugin is driven through its own controls instead: clicking its (hidden)
 * bubble toggles the chat popup, so every piece of the plugin's behaviour —
 * terms, reCAPTCHA, reconnection, unread counts — is untouched. While the chat
 * popup is open, the widget's bubble turns into its close button, and the
 * plugin's unread badge is mirrored onto the widget's bubble.
 */

const PLUGIN_WAIT_MS = 20_000;

const HIDE_PLUGIN_LAUNCHER = `
  #chat-bubble, #chat-callout { display: none !important; }
`;

interface ChatPlugin {
  root: ShadowRoot;
  bubble: HTMLElement;
  popup: HTMLElement;
  badge: HTMLElement | null;
}

function findChatPlugin(): ChatPlugin | null {
  const root = document.getElementById("chat-plugin-host")?.shadowRoot;
  if (!root) return null;
  const bubble = root.getElementById("chat-bubble");
  const popup = root.getElementById("chat-popup");
  if (!bubble || !popup) return null;
  return { root, bubble, popup, badge: root.getElementById("chat-unread-badge") };
}

/** Resolve once the plugin has rendered, or with null after `timeout`. */
function waitForChatPlugin(timeout = PLUGIN_WAIT_MS): Promise<ChatPlugin | null> {
  const found = findChatPlugin();
  if (found) return Promise.resolve(found);
  return new Promise((resolve) => {
    // The plugin appends its host to <body> and fills the shadow root in the
    // same task, so an observer catches it before its launcher ever paints.
    const finish = (plugin: ChatPlugin | null) => {
      observer.disconnect();
      window.clearTimeout(timer);
      resolve(plugin);
    };
    const observer = new MutationObserver(() => {
      const plugin = findChatPlugin();
      if (plugin) finish(plugin);
    });
    observer.observe(document.body, { childList: true });
    const timer = window.setTimeout(() => finish(findChatPlugin()), timeout);
  });
}

export function initContactWidget() {
  const widget = document.querySelector<HTMLElement>("[data-contact-widget]");
  if (!widget) return;
  const panel = widget.querySelector<HTMLElement>("[data-contact-panel]");
  const toggle = widget.querySelector<HTMLButtonElement>("[data-contact-toggle]");
  const badge = widget.querySelector<HTMLElement>("[data-contact-badge]");
  if (!panel || !toggle) return;

  let chat: ChatPlugin | null = null;
  let returnFocusToToggle = false;

  const isOpen = () => widget.dataset.open === "true";
  const chatOpen = () => !!chat && !chat.popup.classList.contains("hidden");

  const syncToggleLabel = () => {
    const unread = badge && !badge.hidden ? badge.textContent : "";
    if (chatOpen()) toggle.setAttribute("aria-label", "Close chat");
    else if (isOpen()) toggle.setAttribute("aria-label", "Close contact options");
    else toggle.setAttribute("aria-label", unread ? `Contact us (${unread} unread chat messages)` : "Contact us");
  };

  const openPanel = () => {
    panel.hidden = false;
    widget.dataset.open = "true";
    toggle.setAttribute("aria-expanded", "true");
    syncToggleLabel();
    panel.querySelector<HTMLElement>(".contact-widget__option")?.focus();
  };

  const closePanel = (restoreFocus = false) => {
    if (!isOpen()) return;
    panel.hidden = true;
    widget.dataset.open = "false";
    toggle.setAttribute("aria-expanded", "false");
    syncToggleLabel();
    if (restoreFocus) toggle.focus();
  };

  const toggleChat = () => chat?.bubble.click();

  toggle.addEventListener("click", () => {
    if (chatOpen()) { toggleChat(); return; }
    if (isOpen()) closePanel(true);
    else openPanel();
  });

  widget.querySelector("[data-contact-close]")?.addEventListener("click", () => closePanel(true));

  // Escape closes the menu; a click anywhere outside it does too.
  widget.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isOpen()) {
      event.stopPropagation();
      closePanel(true);
    }
  });
  document.addEventListener("click", (event) => {
    if (isOpen() && !widget.contains(event.target as Node)) closePanel();
  });

  // Arrow keys move between the three options, as in a menu.
  panel.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const options = [...panel.querySelectorAll<HTMLElement>(".contact-widget__option")];
    const index = options.indexOf(document.activeElement as HTMLElement);
    if (index === -1) return;
    event.preventDefault();
    const step = event.key === "ArrowDown" ? 1 : -1;
    options[(index + step + options.length) % options.length].focus();
  });

  /* --- 1. Send Us a Message ------------------------------------------- */

  // The lead-form module's document listener opens the modal; this only
  // closes the menu first and sends focus back to the bubble afterwards,
  // since the option that opened the modal is hidden by then.
  const leadModal = document.querySelector<HTMLDialogElement>("[data-lead-modal]");
  panel.querySelector('[data-contact-action="message"]')?.addEventListener("click", () => {
    returnFocusToToggle = true;
    closePanel();
  });
  leadModal?.addEventListener("close", () => {
    if (returnFocusToToggle) toggle.focus();
    returnFocusToToggle = false;
  });

  /* --- 2. Direct Message ---------------------------------------------- */

  const chatButton = panel.querySelector<HTMLButtonElement>('[data-contact-action="chat"]');
  chatButton?.addEventListener("click", async () => {
    closePanel();
    if (!chat) {
      chatButton.setAttribute("aria-busy", "true");
      toggle.setAttribute("aria-busy", "true");
      chat = await waitForChatPlugin(5_000);
      if (chat) adoptChatPlugin(chat);
      chatButton.removeAttribute("aria-busy");
      toggle.removeAttribute("aria-busy");
    }
    if (chat) {
      if (!chatOpen()) toggleChat();
      return;
    }
    // The chat could not load (blocked, offline): fall back to the contact
    // form rather than leaving the visitor with a button that does nothing.
    panel.querySelector<HTMLElement>('[data-contact-action="message"]')?.click();
  });

  /* --- 3. Call Now: a plain tel: link; just tidy the menu away. -------- */

  panel.querySelector('[data-contact-action="call"]')?.addEventListener("click", () => closePanel());

  /* --- chat plugin integration ---------------------------------------- */

  const adopted = new WeakSet<ShadowRoot>();
  function adoptChatPlugin(plugin: ChatPlugin) {
    if (adopted.has(plugin.root)) return;
    adopted.add(plugin.root);

    const style = document.createElement("style");
    style.textContent = HIDE_PLUGIN_LAUNCHER;
    plugin.root.appendChild(style);

    const syncChatState = () => {
      const open = chatOpen();
      widget.dataset.chatOpen = open ? "true" : "false";
      if (open) closePanel();
      syncToggleLabel();
    };
    const syncBadge = () => {
      if (!badge) return;
      const source = plugin.badge;
      const visible = !!source && !source.classList.contains("hidden") && !!source.textContent?.trim();
      badge.hidden = !visible;
      badge.textContent = visible ? source!.textContent!.trim() : "";
      syncToggleLabel();
    };

    new MutationObserver(syncChatState).observe(plugin.popup, { attributes: true, attributeFilter: ["class"] });
    if (plugin.badge) {
      new MutationObserver(syncBadge).observe(plugin.badge, {
        attributes: true, attributeFilter: ["class"], childList: true, characterData: true, subtree: true,
      });
    }
    syncChatState();
    syncBadge();
  }

  void waitForChatPlugin().then((plugin) => {
    if (!plugin) return;
    chat = plugin;
    adoptChatPlugin(plugin);
  });
}
