import dynamic from "next/dynamic";

const Explorer = dynamic(() => import("@/components/O2CExplorer"), { ssr: false });

export default function Page() {
  return <Explorer />;
}
