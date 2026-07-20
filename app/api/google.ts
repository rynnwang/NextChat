import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/app/server/require-session";
import {
  resolveMaasEndpoint,
  isErrorResponse,
} from "@/app/server/maas-request";
import { ApiPath } from "@/app/constant";
import { prettyObject } from "@/app/utils/format";

export async function handle(
  req: NextRequest,
  { params }: { params: { provider: string; path: string[] } },
) {
  console.log("[Google Route] params ", params);

  if (req.method === "OPTIONS") {
    return NextResponse.json({ body: "OK" }, { status: 200 });
  }

  const denied = await requireSession(req);
  if (denied) return denied;

  const endpoint = await resolveMaasEndpoint(req, "gemini");
  if (isErrorResponse(endpoint)) return endpoint;

  try {
    return await request(
      req,
      endpoint.baseUrl,
      endpoint.apiKey,
      endpoint.extraHeaders,
    );
  } catch (e) {
    console.error("[Google] ", e);
    return NextResponse.json(prettyObject(e));
  }
}

export const GET = handle;
export const POST = handle;

async function request(
  req: NextRequest,
  configuredBaseUrl: string,
  apiKey: string,
  extraHeaders: Record<string, string> | undefined,
) {
  const controller = new AbortController();

  let baseUrl = configuredBaseUrl;
  let path = `${req.nextUrl.pathname}`.replaceAll(ApiPath.Google, "");

  if (!baseUrl.startsWith("http")) {
    baseUrl = `https://${baseUrl}`;
  }

  if (baseUrl.endsWith("/")) {
    baseUrl = baseUrl.slice(0, -1);
  }

  console.log("[Proxy] ", path);
  console.log("[Base Url]", baseUrl);

  const timeoutId = setTimeout(
    () => {
      controller.abort();
    },
    10 * 60 * 1000,
  );
  const fetchUrl = `${baseUrl}${path}${
    req?.nextUrl?.searchParams?.get("alt") === "sse" ? "?alt=sse" : ""
  }`;

  console.log("[Fetch Url] ", fetchUrl);
  const fetchOptions: RequestInit = {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "x-goog-api-key": apiKey,
      ...extraHeaders,
    },
    method: req.method,
    body: req.body,
    // to fix #2485: https://stackoverflow.com/questions/55920957/cloudflare-worker-typeerror-one-time-use-body
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
