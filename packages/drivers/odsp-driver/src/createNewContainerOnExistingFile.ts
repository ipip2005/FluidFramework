/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISummaryTree } from "@fluidframework/protocol-definitions";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { UsageError } from "@fluidframework/driver-utils";
import {
  InstrumentedStorageTokenFetcher,
  IOdspResolvedUrl
} from "@fluidframework/odsp-driver-definitions";
import { IWriteSummaryResponse } from "./contracts";
import {
  createCacheSnapshotKey,
  getOrigin,
  IExistingFileInfo,
} from "./odspUtils";
import { ISnapshotContents } from "./odspPublicUtils";
import { createOdspUrl } from "./createOdspUrl";
import { getApiRoot } from "./odspUrlHelper";
import { EpochTracker } from "./epochTracker";
import { OdspDriverUrlResolver } from "./odspDriverUrlResolver";
import { convertCreateNewSummaryTreeToTreeAndBlobs, convertSummaryIntoContainerSnapshot, CreateNewContainerOnExistingFile, createNewFluidContainerCore } from "./createNewUtils";
import { ClpCompliantAppHeader } from "./contractsPublic";

/**
 * Creates a new Fluid container on an existing file.
 */
export async function createNewContainerOnExistingFile(
  ...args: CreateNewContainerOnExistingFile
): Promise<IOdspResolvedUrl> {
  const [
    getStorageToken,
    fileInfo,
    logger,
    createNewSummary,
    epochTracker,
    fileEntry,
    createNewCaching,
    forceAccessTokenViaAuthorizationHeader,
    isClpCompliantApp
  ] = args;

  if (createNewSummary === undefined) {
    const toThrow = new UsageError("createNewSummary must exist to create a new container");
    logger.sendErrorEvent({ eventName: "UnsupportedUsage" }, toThrow);
    throw toThrow;
  }

  const { id: summaryHandle } = await createNewFluidContainerOnExistingFileFromSummary(
    getStorageToken,
    fileInfo,
    logger,
    createNewSummary,
    epochTracker,
    forceAccessTokenViaAuthorizationHeader,
  );

  const odspUrl = createOdspUrl({ ...fileInfo, dataStorePath: "/" });
  const resolver = new OdspDriverUrlResolver();
  const odspResolvedUrl = await resolver.resolve({
    url: odspUrl,
    headers: { [ClpCompliantAppHeader.isClpCompliantApp]: isClpCompliantApp },
  });
  fileEntry.docId = odspResolvedUrl.hashedDocumentId;
  fileEntry.resolvedUrl = odspResolvedUrl;

  if (createNewCaching) {
    // converting summary and getting sequence number
    const snapshot: ISnapshotContents = convertCreateNewSummaryTreeToTreeAndBlobs(createNewSummary, summaryHandle);
    // caching the converted summary
    await epochTracker.put(createCacheSnapshotKey(odspResolvedUrl), snapshot);
  }

  return odspResolvedUrl;
}

async function createNewFluidContainerOnExistingFileFromSummary(
  getStorageToken: InstrumentedStorageTokenFetcher,
  fileInfo: IExistingFileInfo,
  logger: ITelemetryLogger,
  createNewSummary: ISummaryTree,
  epochTracker: EpochTracker,
  forceAccessTokenViaAuthorizationHeader: boolean,
): Promise<IWriteSummaryResponse> {
  const baseUrl = `${getApiRoot(getOrigin(fileInfo.siteUrl))}/drives/${fileInfo.driveId}/items/${fileInfo.itemId}`;

  const containerSnapshot = convertSummaryIntoContainerSnapshot(createNewSummary);

  const initialUrl = `${baseUrl}/opStream/snapshots/snapshot`;

  return createNewFluidContainerCore(
    containerSnapshot,
    getStorageToken,
    logger,
    initialUrl,
    forceAccessTokenViaAuthorizationHeader,
    epochTracker,
    "CreateNewContainerOnExistingFile",
    "uploadSummary"
  );
}
