import type { NextApiRequest, NextApiResponse } from "next";

import { getAgentHubView } from "@/server/read-models/agents";
import { requireMethod } from "@/server/http/api";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, "GET")) {
    return;
  }

  res.status(200).json(await getAgentHubView());
}
