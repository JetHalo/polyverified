import type { GetServerSidePropsContext } from "next";

import AgentProfile from "@/pages/AgentProfile";
import { loadAgentProfilePageProps } from "@/server/page-loaders";
import type { AgentSlug } from "@/server/types";

export async function getServerSideProps(context: GetServerSidePropsContext) {
  const slug = context.params?.slug;
  const normalizedSlug = Array.isArray(slug) ? slug[0] : slug;

  if (!normalizedSlug) {
    return { notFound: true as const };
  }

  return loadAgentProfilePageProps(normalizedSlug as AgentSlug);
}

export default AgentProfile;
