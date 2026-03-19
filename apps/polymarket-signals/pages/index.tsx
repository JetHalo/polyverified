import Feed from "@/pages/Feed";
import { loadFeedPageProps } from "@/server/page-loaders";

export const getServerSideProps = loadFeedPageProps;

export default Feed;
