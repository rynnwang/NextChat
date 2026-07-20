import { OpenaiPath } from "@/app/constant";
import { prettyObject } from "@/app/utils/format";
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/app/server/require-session";
import {
  resolveMaasEndpoint,
  isErrorResponse,
} from "@/app/server/maas-request";
import { requestOpenai } from "./common";

const ALLOWED_PATH = new Set(Object.values(OpenaiPath));

export async function handle(
  req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  console.log("[OpenAI Route] params ", params);

  if (req.method === "OPTIONS") {
    return NextResponse.json({ body: "OK" }, { status: 200 });
  }

  const subpath = params.path.join("/");

  if (!ALLOWED_PATH.has(subpath)) {
    console.log("[OpenAI Route] forbidden path ", subpath);
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

  const endpoint = await resolveMaasEndpoint(req, "openai");
  if (isErrorResponse(endpoint)) return endpoint;

  try {
    return await requestOpenai(req, endpoint);
  } catch (e) {
    console.error("[OpenAI] ", e);
    return NextResponse.json(prettyObject(e));
  }
}

export const GET = handle;
export const POST = handle;
