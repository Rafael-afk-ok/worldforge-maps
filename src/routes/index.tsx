import { createFileRoute } from "@tanstack/react-router";
import MapApp from "@/components/MapApp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Frontiers Map Simulator — Mapa de nações" },
      { name: "description", content: "Mapa editável de nações, alianças, tratados, cidades, fortes e rotas." },
      { property: "og:title", content: "Frontiers Map Simulator" },
      { property: "og:description", content: "Mapa editável de nações, alianças, tratados, cidades, fortes e rotas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MapApp,
});
