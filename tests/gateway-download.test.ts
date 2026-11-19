import { describe, it, expect, beforeEach } from "vitest";
import { __resetDownloadCache, downloadGatewayMsi, msiFileName } from "@/lib/integrations/gateway-download";

/**
 * NEDLADDNINGEN AV TIKKR GATEWAY, mot en fejkad GitHub.
 *
 * Repot är privat, så Tikkr hämtar MSI:n med en läsnyckel och skickar den
 * vidare. Det som prövas: rätt release och fil, nyckeln på båda anropen, och
 * begripliga fel när något saknas.
 */

const release = { version: "0.2.0", sha256: "ab".repeat(32) };

function fakeGitHub(options: { tag?: number; assets?: { name: string; url: string }[]; file?: number } = {}) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    if (url.includes("/releases/tags/")) {
      return new Response(JSON.stringify({ assets: options.assets ?? [{ name: msiFileName("0.2.0"), url: "https://api.github.com/assets/1" }] }), {
        status: options.tag ?? 200,
      });
    }
    return new Response(new Uint8Array([1, 2, 3]), { status: options.file ?? 200, headers: { "content-length": "3" } });
  }) as typeof fetch;
  return { impl, calls };
}

beforeEach(() => __resetDownloadCache());

describe("nedladdningen", () => {
  it("hämtar filen ur releasen för versionen, med nyckeln", async () => {
    const github = fakeGitHub();
    const result = await downloadGatewayMsi(release, "ghp_test", github.impl);

    expect(result).toMatchObject({ ok: true, size: 3, fileName: "TikkrGateway-0.2.0.msi" });
    expect(github.calls[0].url).toBe("https://api.github.com/repos/TERAFALK/tikkr-gateway/releases/tags/v0.2.0");
    expect(github.calls[1].url).toBe("https://api.github.com/assets/1");
    expect(github.calls[1].headers.Accept).toBe("application/octet-stream");
    for (const call of github.calls) expect(call.headers.Authorization).toBe("Bearer ghp_test");
  });

  it("slår upp releasen en gång och sparar adressen", async () => {
    const github = fakeGitHub();
    await downloadGatewayMsi(release, "ghp_test", github.impl);
    await downloadGatewayMsi(release, "ghp_test", github.impl);
    expect(github.calls.filter((c) => c.url.includes("/releases/tags/"))).toHaveLength(1);
  });

  it("utan publicerad version finns ingenting att hämta", async () => {
    expect(await downloadGatewayMsi(null, "ghp_test", fakeGitHub().impl)).toMatchObject({ ok: false, status: 404 });
  });

  it("utan nyckel säger den att nedladdningen inte är uppsatt", async () => {
    const github = fakeGitHub();
    expect(await downloadGatewayMsi(release, "", github.impl)).toMatchObject({ ok: false, status: 503 });
    expect(github.calls).toHaveLength(0);
  });

  it("en release som saknas eller saknar filen ger 404", async () => {
    expect(await downloadGatewayMsi(release, "ghp_test", fakeGitHub({ tag: 404 }).impl)).toMatchObject({ ok: false, status: 404 });
    __resetDownloadCache();
    expect(await downloadGatewayMsi(release, "ghp_test", fakeGitHub({ assets: [] }).impl)).toMatchObject({ ok: false, status: 404 });
  });

  it("ett fel hos GitHub ger 502 och glömmer adressen", async () => {
    const failing = fakeGitHub({ file: 500 });
    expect(await downloadGatewayMsi(release, "ghp_test", failing.impl)).toMatchObject({ ok: false, status: 502 });

    const working = fakeGitHub();
    expect((await downloadGatewayMsi(release, "ghp_test", working.impl)).ok).toBe(true);
    expect(working.calls[0].url).toContain("/releases/tags/");
  });
});
