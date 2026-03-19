import RevealedHistory from "@/pages/RevealedHistory";
import { loadHistoryPageProps } from "@/server/page-loaders";

export const getServerSideProps = loadHistoryPageProps;

export default RevealedHistory;
