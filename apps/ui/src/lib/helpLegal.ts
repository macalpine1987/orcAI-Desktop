/** · attribution, CC BY-SA 4.0, bundled orcAI 3.0.4. */

export const CC_BY_SA_URL = "https://creativecommons.org/licenses/by-sa/4.0/";

export const DESKTOP_AUTHOR = "Vadim Romanov";

export const DESKTOP_ORG = "Iteranet";

export const DESKTOP_EMAIL = "vadimromanoff@outlook.com";

export const DESKTOP_EMAIL_HREF = `mailto:${DESKTOP_EMAIL}`;

export const DESKTOP_COPYRIGHT = "Copyright © 2026 Vadim Romanov";

export const ORCAI_ENGINE_VERSION = "3.0.4";

export const ORCAI_DOI = "https://doi.org/10.1111/mms.70083";

export const ORCAI_DOI_SHORT = "doi.org/10.1111/mms.70083";

export const ORCAI_WILEY_URL = "https://onlinelibrary.wiley.com/doi/10.1111/mms.70083";

export const ORCAI_WILEY_HOST = "onlinelibrary.wiley.com";

export const ORCAI_CFF_VERSION = "1.2.0";

export const ORCAI_CFF_TITLE = "orcai";

export const ORCAI_CFF_TYPE = "software";

export const ORCAI_CFF_LICENSE = "CC-BY-SA-4.0";

export const ORCAI_CFF_KEYWORDS = "Bioacoustics · Classification · Orca";

export const ORCAI_PAPER_TITLE =
  "orcAI: A Machine Learning Tool to Detect and Classify Acoustic Signals of Killer Whales in Audio Recordings.";

export const ORCAI_PAPER_JOURNAL = "Marine Mammal Science";

export const ORCAI_PAPER_YEAR = "2025";

export const ORCAI_PAPER_VOLUME_ISSUE = "42 (1)";

export const ORCAI_PAPER_PAGES = "e70083";

export type HelpCffPerson = {
  name: string;
  affiliation: string;
  orcid: string;
  email?: string;
};

export function orcidHref(orcid: string): string {
  return `https://orcid.org/${orcid}`;
}

/** CITATION.cff `authors:` (software). */
export const ORCAI_CFF_SOFTWARE_AUTHORS: HelpCffPerson[] = [
  {
    name: "Daniel C. Angst",
    affiliation: "Institute for Integrative Biology, ETH Zürich",
    orcid: "0000-0002-6512-4595",
    email: "daniel.angst@env.ethz.ch",
  },
  {
    name: "Nicolas Ochsner",
    affiliation: "Institute for Integrative Biology, ETH Zürich",
    orcid: "0009-0009-0796-1502",
    email: "nicolas.ochsner@env.ethz.ch",
  },
  {
    name: "Sebastian Bonhoeffer",
    affiliation: "Institute for Integrative Biology, ETH Zürich",
    orcid: "0000-0001-8052-3925",
    email: "sebastian.bonhoeffer@env.ethz.ch",
  },
  {
    name: "Chérine D. Baumgartner",
    affiliation: "Institute for Integrative Biology, ETH Zürich",
    orcid: "0000-0001-9309-3581",
    email: "cherine.baumgartner@env.ethz.ch",
  },
];

/** CITATION.cff preferred-citation.authors (MMS 42:e70083). */
export const ORCAI_CFF_PAPER_AUTHORS: HelpCffPerson[] = [
  {
    name: "Sebastian Bonhoeffer",
    affiliation: "Institute of Integrative Biology, ETH Zurich, Zurich, Switzerland",
    orcid: "0000-0001-8052-3925",
  },
  {
    name: "Anna Selbmann",
    affiliation: "Westman Islands Research Centre, University of Iceland, Vestmannaeyjar, Iceland",
    orcid: "0000-0001-8687-7265",
  },
  {
    name: "Daniel C. Angst",
    affiliation: "Institute of Integrative Biology, ETH Zurich, Zurich, Switzerland",
    orcid: "0000-0002-6512-4595",
  },
  {
    name: "Nicolas Ochsner",
    affiliation: "Institute of Integrative Biology, ETH Zurich, Zurich, Switzerland",
    orcid: "0009-0009-0796-1502",
  },
  {
    name: "Patrick J. O. Miller",
    affiliation: "School of Biology, University of St Andrews, St Andrews, Scotland, UK",
    orcid: "0000-0001-8028-9673",
  },
  {
    name: "Filipa I. P. Samarra",
    affiliation: "Westman Islands Research Centre, University of Iceland, Vestmannaeyjar, Iceland",
    orcid: "0000-0002-9909-0565",
  },
  {
    name: "Chérine D. Baumgartner",
    affiliation: "Institute for Integrative Biology, ETH Zürich",
    orcid: "0000-0001-9309-3581",
  },
];

export const ORCAI_CFF_ABSTRACT =
  "Acoustic monitoring is an essential tool for investigating animal communication and behavior when visual contact is limited, but the scalability of bioacoustic projects is often limited by time-intensive manual auditing of focal signals. To address this bottleneck, we introduce orcAI — a novel deep learning framework for the automated detection and classification of a broad acoustic repertoire of killer whales (Orcinus orca), including vocalizations (e.g., pulsed calls, whistles) and incidental sounds (e.g., breathing, tail slaps). orcAI combines a ResNet-based Convolutional Neural Network (ResNet-CNN) with Long Short-Term Memory (LSTM) layers to capture both spatial features and temporal context, enabling the model to classify signals and to accurately determine their temporal boundaries in spectrograms. Trained on a comprehensive dataset from herring-feeding killer whales off Iceland, the framework was designed to be adaptable to other populations upon training with equivalent data. Our final model achieves up to 98.2% accuracy on test data and is delivered as an open-source tool with an easy-to-use command-line interface.";

export const ORCAI_GITHUB = "https://github.com/ethz-tb/orcAI";

export const ORCAI_GITHUB_HOST = "github.com/ethz-tb/orcAI";

/** Homepage of ETH Zurich Theoretical Biology (GitHub org ethz-tb). */
export const ORCAI_LAB_URL = "https://tb.ethz.ch";

export const ORCAI_LAB_HOST = "tb.ethz.ch";

/** Full author list from Crossref / CITATION.cff preferred-citation (MMS 42:e70083). */
export const ORCAI_PAPER_AUTHORS = [
  "Sebastian Bonhoeffer",
  "Anna Selbmann",
  "Daniel C. Angst",
  "Nicolas Ochsner",
  "Patrick J. O. Miller",
  "Filipa I. P. Samarra",
  "Chérine D. Baumgartner",
] as const;

/**
 * Software authors as designated in the orcAI repo `CITATION.cff` `authors:`
 * (not GitHub commit counts, not the paper list).
 */
export const ORCAI_SOFTWARE_AUTHORS = [
  "Daniel C. Angst",
  "Nicolas Ochsner",
  "Sebastian Bonhoeffer",
  "Chérine D. Baumgartner",
] as const;

export const NOTICE_FRAGMENT = `orcAI Desktop
Copyright (c) 2026 Vadim Romanov
Licensed under CC BY-SA 4.0

This product bundles orcAI ${ORCAI_ENGINE_VERSION} (unchanged)
Software authors (CITATION.cff): Angst, Ochsner, Bonhoeffer, Baumgartner
Paper: Bonhoeffer et al., Mar. Mamm. Sci. 42:e70083 (2025)
Lab: Theoretical Biology, ETH Zurich (https://tb.ethz.ch)
See THIRD_PARTY_LICENSES for dependencies.
`;

export const LICENSE_TEXT = `Creative Commons Attribution-ShareAlike 4.0 International

orcAI Desktop
Copyright © 2026 Vadim Romanov

This work is licensed under the Creative Commons Attribution-ShareAlike 4.0
International License.

You are free to:
  Share — copy and redistribute the material in any medium or format
  Adapt — remix, transform, and build upon the material
for any purpose, even commercially.

Under the following terms:
  Attribution — You must give appropriate credit, provide a link to the
    license, and indicate if changes were made.
  ShareAlike — If you remix, transform, or build upon the material, you
    must distribute your contributions under the same license as the original.
  No additional restrictions — You may not apply legal terms or technological
    measures that legally restrict others from doing anything the license permits.

Notices:
  You do not have to comply with the license for elements of the material
  in the public domain or where your use is permitted by an applicable
  exception or limitation.
  No warranties are given. The license may not give you all of the
  permissions necessary for your intended use.

This product bundles orcAI ${ORCAI_ENGINE_VERSION} unchanged (same license). Bundling or
mentioning orcAI authors does not imply their endorsement of orcAI Desktop
(CC BY-SA 4.0 §2(a)(6)).

SPDX-License-Identifier: CC-BY-SA-4.0
https://creativecommons.org/licenses/by-sa/4.0/
https://creativecommons.org/licenses/by-sa/4.0/legalcode
`;

export const BUNDLED_LEGAL_FILES = [
  "LICENSE",
  "NOTICE",
  "THIRD_PARTY_LICENSES",
] as const;

const ENDORSEMENT_RE =
  /одобрен[аоы]|совместно выпустил|endorsed by|joint(?:ly)? released|approved by ETH/i;

export function containsEndorsement(text: string): boolean {
  return ENDORSEMENT_RE.test(text);
}
