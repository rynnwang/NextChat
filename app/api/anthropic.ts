import { Anthropic, ApiPath } from "@/app/constant";
import { prettyObject } from "@/app/utils/format";
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/app/server/require-session";
import {
  resolveMaasEndpoint,
  isErrorResponse,
} from "@/app/server/maas-request";
import { cloudflareAIGatewayUrl } from "@/app/utils/cloudflare";

const ALLOWED_PATH = new Set([
  Anthropic.ChatPath,
  Anthropic.ChatPath1,
  Anthropic.ListModelPath,
]);

export async function handle(
  req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  console.log("[Anthropic Route] params ", params);

  if (req.method === "OPTIONS") {
    return NextResponse.json({ body: "OK" }, { status: 200 });
  }

  const subpath = params.path.join("/");

  if (!ALLOWED_PATH.has(subpath)) {
    console.log("[Anthropic Route] forbidden path ", subpath);
    return NextResponse.json(
      {
        error: true,
        msg: "you are not allowed to request " + subpath,
      },
      {
        status: 403,
      },
    );
  }

  const denied = await requireSession(req);
  if (denied) return denied;

  const endpoint = await resolveMaasEndpoint(req, "anthropic");
  if (isErrorResponse(endpoint)) return endpoint;

  try {
    return await request(
      req,
      endpoint.baseUrl,
      endpoint.apiKey,
      endpoint.anthropicVersion,
      endpoint.extraHeaders,
    );
  } catch (e) {
    console.error("[Anthropic] ", e);
    return NextResponse.json(prettyObject(e));
  }
}

export const GET = handle;
export const POST = handle;

async function request(
  req: NextRequest,
  configuredBaseUrl: string,
  apiKey: string,
  anthropicVersion: string | undefined,
  extraHeaders: Record<string, string> | undefined,
) {
  const controller = new AbortController();

  let baseUrl = configuredBaseUrl;
  if (!baseUrl.startsWith("http")) {
    baseUrl = `https://${baseUrl}`;
  }
  if (baseUrl.endsWith("/")) {
    baseUrl = baseUrl.slice(0, -1);
  }

  const path = `${req.nextUrl.pathname}`.replaceAll(ApiPath.Anthropic, "");

  console.log("[Proxy] ", path);
  console.log("[Base Url]", baseUrl);

  const timeoutId = setTimeout(
    () => {
      controller.abort();
    },
    10 * 60 * 1000,
  );

  // try rebuild url, when using cloudflare ai gateway in server
  const fetchUrl = cloudflareAIGatewayUrl(`${baseUrl}${path}`);

  const fetchOptions: RequestInit = {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "anthropic-dangerous-direct-browser-access": "true",
      "x-api-key": apiKey,
      "anthropic-version": anthropicVersion || Anthropic.Vision,
      ...extraHeaders,
    },
    method: req.method,
    body: req.body,
    redirect: "manual",
    // @ts-ignore
    duplex: "half",
    signal: controller.signal,
  };

  try {
    const res = await fetch(fetchUrl, fetchOptions);

    // to prevent browser prompt for credentials
    const newHeaders = new Headers(res.headers);
    newHeaders.delete("www-authenticate");
    // to disable nginx buffering
    newHeaders.set("X-Accel-Buffering", "no");

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: newHeaders,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
