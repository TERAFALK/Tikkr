import Pager from "@/components/platform/Pager";
import {
  listHref,
  PER_PAGE,
  PER_PAGE_CHOICES,
  type Paging,
} from "@/lib/paging";

/**
 * BLÄDDRINGEN I REGISTREN: ordrar, kunder och anställda.
 *
 * Bläddringen från Stämplingar, plus valet av hur många rader en sida bär.
 *
 * Syns inte alls när hela listan ryms i förvalet (`PER_PAGE`). Det avgörs på
 * antalet rader och inte på antalet sidor: den som valt 100 på en lista med 80
 * rader har en sida, men ska fortfarande kunna välja om.
 *
 * Sökningen följer med, men ett nytt radantal börjar om på sidan ett. Sida 7
 * med 25 rader säger ingenting om var man hamnar med 100.
 */
export default function ListPager({
  paging,
  total,
  unit,
  path,
  query,
  anchor,
}: {
  paging: Paging;
  total: number;
  /** Vad raderna är, i plural: "ordrar", "kunder". */
  unit: string;
  path: string;
  query?: string;
  /** Listans id, när den ligger långt ner på sidan. Se `listHref`. */
  anchor?: string;
}) {
  if (total <= PER_PAGE) return null;

  return (
    <Pager
      page={paging.page}
      pageCount={paging.pageCount}
      total={total}
      unit={unit}
      hrefFor={(page) =>
        listHref(path, { query, page, perPage: paging.take, anchor })
      }
      sizes={{
        current: paging.take,
        choices: PER_PAGE_CHOICES,
        hrefFor: (perPage) =>
          listHref(path, { query, page: 1, perPage, anchor }),
      }}
    />
  );
}
