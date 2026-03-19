import type { NextApiRequest, NextApiResponse } from "next";

import { getSingleQueryValue, notFound, requireMethod } from "@/server/http/api";
import { getAgentProfileView } from "@/server/read-models/agents";
import type { AgentSlug } from "@/server/types";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, "GET")) {
    return;
  }

  const slug = getSingleQueryValue(req.query.slug) as AgentSlug | undefined;

  if (!slug) {
    res.status(400).json({ error: "slug is required" });
    return;
  }

  const view = await getAgentProfileView(slug);

  if (!view) {
    notFound(res, "Unknown agent");
    return;
  }

  res.status(200).json(view);
}
