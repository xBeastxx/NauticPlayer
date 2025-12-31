'use strict';
import { fetchHtml, type SubtitleOptions, type SubtitleInfo, MovieList, SubtitleList } from './subdl-utils';

const DOMAIN = 'subdl.com';
const SITE = 'https://' + DOMAIN;

export class SubdlMovieLink extends MovieList {
  constructor(title: string, link: string, options: SubtitleOptions) {
    super(title, link, options);
  }
  async toSubtitleLinks(): Promise<SubdlSubtitleLink[]> {
    const root = await fetchHtml(SITE + this.link);

    let retval = Array.from(root.querySelectorAll('div[class="flex flex-col mt-4 select-none"]')).flatMap(section => {
      const lang = section.firstElementChild?.firstElementChild?.firstElementChild?.textContent.toLowerCase();
      if (this.options.language && lang != this.options.language) return [];

      const retval = Array.from(section.getElementsByTagName('li')).map(s => new SubdlSubtitleLink(this,
        s.lastElementChild?.lastElementChild?.getAttribute('href')!, {
        filename: s.firstElementChild?.firstElementChild?.textContent,
        language: lang,
      }));

      return retval;
    }).filter(subtitle => subtitle._link != undefined);

    return retval;
  }
}

export class SubdlSubtitleLink extends SubtitleList {
  isZip(): boolean { return true; }
  constructor(page: SubdlMovieLink, _link: string, info: SubtitleInfo) {
    super(page, _link, info);
  }

  async downloadLink(): Promise<string> {
    return this._link;
  }
}

interface SubdlSuggestion {
  type: string;
  name: string;
  poster_url: string;
  year: number;
  link: string;
  original_name: string;
}

export default async function fetchSubdlCom(query: string, options: SubtitleOptions = {}): Promise<SubdlMovieLink[]> {
  const response = await fetch(`https://api.${DOMAIN}/auto?query=${query}`);
  if (!response.ok) throw new Error(`HTTP Error! status: ${response.status}\nBody: ${await response.text()}`);

  const json = await response.json() as {results: SubdlSuggestion[]};
  return Array.from(json.results).map(e => new SubdlMovieLink(e.name, e.link, options));
}
