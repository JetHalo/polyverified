import AgentHub from "@/pages/AgentHub";
import { loadAgentHubPageProps } from "@/server/page-loaders";

export const getServerSideProps = loadAgentHubPageProps;

export default AgentHub;
