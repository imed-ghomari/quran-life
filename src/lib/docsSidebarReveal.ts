export const DOCS_SIDEBAR_REVEAL_PARAM = 'revealSidebarFile';

const ABSOLUTE_SCHEME = /^[a-zA-Z][a-zA-Z\d+\-.]*:/;

export const withDocsSidebarReveal = (href: string): string => {
    if (!href || href.startsWith('#') || ABSOLUTE_SCHEME.test(href) || href.startsWith('//')) {
        return href;
    }

    const hashIndex = href.indexOf('#');
    const pathAndQuery = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
    const hash = hashIndex >= 0 ? href.slice(hashIndex) : '';

    const queryIndex = pathAndQuery.indexOf('?');
    const path = queryIndex >= 0 ? pathAndQuery.slice(0, queryIndex) : pathAndQuery;
    const query = queryIndex >= 0 ? pathAndQuery.slice(queryIndex + 1) : '';

    const params = new URLSearchParams(query);
    params.set(DOCS_SIDEBAR_REVEAL_PARAM, '1');
    const nextQuery = params.toString();

    return `${path}${nextQuery ? `?${nextQuery}` : ''}${hash}`;
};
