"use strict";

(() => {
  const title = document.getElementById("title");
  const description = document.getElementById("description");
  const confirm = document.getElementById("confirm");
  const status = document.getElementById("status");
  const help = document.getElementById("help");
  // This is the public app key, never a privileged backend credential.
  const authOrigin = "https://hlupxubllyfsupjrjaca.supabase.co";
  const publishableKey = "sb_publishable_4xIHXzzlXSJhfD3o8Y792Q_F7tcbZwh";
  let link = null;
  let generation = 0;
  let activeRequest = null;

  confirm.addEventListener("click", async () => {
    if (!link || activeRequest) return;
    if (link.type === "recovery") {
      window.location.assign(
        "virtuous://auth/callback?token_hash=" +
          link.tokenHash +
          "&type=recovery",
      );
      status.textContent =
        "Continue in BeVirtuous to choose your new password. Open this email on a device with the app installed.";
      return;
    }
    const tokenHash = link.tokenHash;
    const requestGeneration = generation;
    const controller = new AbortController();
    activeRequest = controller;
    confirm.disabled = true;
    status.textContent = "Confirming your email…";
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(authOrigin + "/auth/v1/verify", {
        method: "POST",
        headers: { apikey: publishableKey, "Content-Type": "application/json" },
        body: JSON.stringify({ token_hash: tokenHash, type: "email" }),
        credentials: "omit",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) {
        if (requestGeneration !== generation) return;
        status.textContent =
          data?.error_code === "otp_expired"
            ? "This link has expired or has already been used. If you confirmed earlier, sign in to BeVirtuous. Otherwise, request a fresh confirmation email in the app."
            : "We couldn’t confirm this link. Try again, or request a fresh confirmation email in BeVirtuous.";
        return;
      }
      // Do not install a browser session. Revoke only the session just issued
      // by verification; other signed-in devices keep their sessions.
      if (typeof data?.access_token === "string") {
        await fetch(authOrigin + "/auth/v1/logout?scope=local", {
          method: "POST",
          headers: {
            apikey: publishableKey,
            Authorization: "Bearer " + data.access_token,
          },
          credentials: "omit",
          cache: "no-store",
          referrerPolicy: "no-referrer",
          signal: controller.signal,
        }).catch(() => {});
      }
      if (requestGeneration !== generation) return;
      if (!data?.user?.id || !data.user.email_confirmed_at) {
        status.textContent =
          "We couldn’t confirm this link. Try again, or request a fresh confirmation email in BeVirtuous.";
        return;
      }
      link = null;
      window.history.replaceState(null, "", window.location.pathname);
      title.textContent = "Email confirmed";
      description.textContent =
        "Return to BeVirtuous on your phone or emulator and sign in with your email and password.";
      confirm.hidden = true;
      help.hidden = true;
      status.textContent = "You can close this page.";
    } catch {
      if (requestGeneration === generation) {
        status.textContent =
          "We couldn’t connect to confirm your email. Check your connection and try again. If you confirmed earlier, sign in to BeVirtuous.";
      }
    } finally {
      clearTimeout(timeout);
      if (activeRequest === controller) activeRequest = null;
      if (requestGeneration === generation) {
        confirm.disabled = false;
      }
    }
  });

  function renderLink() {
    generation += 1;
    activeRequest?.abort();
    activeRequest = null;
    link = null;
    confirm.hidden = true;
    confirm.disabled = false;
    help.hidden = true;
    status.textContent = "";
    title.textContent = "Open your email link";
    description.textContent =
      "Open the latest confirmation or password reset email and tap its link to continue.";
    // Fragments never reach the hosting server. Only an explicit browser
    // confirmation click may send a signup hash to the fixed Auth endpoint.
    const fragment = window.location.hash.slice(1);
    const parameters = new URLSearchParams(fragment);
    const tokenHash = parameters.get("token_hash");
    const type = parameters.get("type");
    const valid =
      ["/", "/auth/callback"].includes(window.location.pathname) &&
      !window.location.search &&
      fragment.length < 128 &&
      parameters.size === 2 &&
      parameters.getAll("token_hash").length === 1 &&
      parameters.getAll("type").length === 1 &&
      /^[a-f0-9]{56}$/i.test(tokenHash || "") &&
      (type === "email" || type === "recovery");

    if (!valid) {
      if (fragment || window.location.search) {
        title.textContent = "This link is incomplete";
        description.textContent =
          "Return to BeVirtuous and request a fresh confirmation or password reset email.";
      }
      return;
    }

    title.textContent =
      type === "recovery" ? "Reset your password" : "Confirm your email";
    description.textContent =
      type === "recovery"
        ? "Continue in BeVirtuous to choose your new password."
        : "Confirm your email to finish signing up. Then return to BeVirtuous and sign in.";
    link = { tokenHash: tokenHash.toLowerCase(), type };
    // Verified app links are routed by iOS/Android before this website opens.
    // Never race an app launch against browser verification of the same hash.
    confirm.textContent =
      type === "recovery" ? "Open BeVirtuous" : "Confirm email";
    confirm.hidden = false;
    help.hidden = type !== "recovery";
  }
  // A mail client can reuse the same browser tab for a later email link.
  window.addEventListener("hashchange", renderLink);
  renderLink();
})();
