/**
 * microCMS API SDK
 * https://github.com/microcmsio/microcms-js-sdk
 */
import { parseQuery } from './utils/parseQuery';
import { isString } from './utils/isCheckValue';
import {
  MicroCMSClient,
  MakeRequest,
  GetRequest,
  GetListRequest,
  GetListDetailRequest,
  GetObjectRequest,
  WriteApiRequestResult,
  CreateRequest,
  MicroCMSListResponse,
  MicroCMSListContent,
  MicroCMSObjectContent,
  UpdateRequest,
  DeleteRequest,
} from './types';
import {
  API_VERSION,
  BASE_DOMAIN,
  MAX_RETRY_COUNT,
  MIN_TIMEOUT_MS,
} from './utils/constants';
import { generateFetchClient } from './lib/fetch';
import retry from 'async-retry';

/**
 * Initialize SDK Client
 */
export const createClient = ({
  serviceDomain,
  apiKey,
  customFetch,
  retry: retryOption,
}: MicroCMSClient) => {
  if (!serviceDomain || !apiKey) {
    throw new Error('parameter is required (check serviceDomain and apiKey)');
  }

  if (!isString(serviceDomain) || !isString(apiKey)) {
    throw new Error('parameter is not string');
  }

  /**
   * Defined microCMS base URL
   */
  const baseUrl = `https://${serviceDomain}.${BASE_DOMAIN}/api/${API_VERSION}`;

  /**
   * Make request
   */
  const makeRequest = async ({
    endpoint,
    contentId,
    queries = {},
    method,
    customHeaders,
    customBody,
  }: MakeRequest) => {
    const fetchClient = generateFetchClient(apiKey, customFetch);
    const queryString = parseQuery(queries);
    const url = `${baseUrl}/${endpoint}${contentId ? `/${contentId}` : ''}${
      queryString ? `?${queryString}` : ''
    }`;

    const getMessageFromResponse = async (response: Response) => {
      // Enclose `response.json()` in a try since it may throw an error
      // Only return the `message` if there is a `message`
      try {
        const { message } = await response.json();
        return message ?? null;
      } catch (_) {
        return null;
      }
    };

    return await retry(
      async (bail) => {
        try {
          const response = await fetchClient(url, {
            method: method || 'GET',
            headers: customHeaders,
            body: customBody,
          });

          // If a status code in the 400 range other than 429 is returned, do not retry.
          if (
            response.status !== 429 &&
            response.status >= 400 &&
            response.status < 500
          ) {
            const message = await getMessageFromResponse(response);

            return bail(
              new Error(
                `fetch API response status: ${response.status}${
                  message ? `\n  message is \`${message}\`` : ''
                }`
              )
            );
          }

          // If the response fails with any other status code, retry until the set number of attempts is reached.
          if (!response.ok) {
            const message = await getMessageFromResponse(response);

            return Promise.reject(
              new Error(
                `fetch API response status: ${response.status}${
                  message ? `\n  message is \`${message}\`` : ''
                }`
              )
            );
          }

          if (method === 'DELETE') return;

          return response.json();
        } catch (error) {
          if (error.data) {
            throw error.data;
          }

          if (error.response?.data) {
            throw error.response.data;
          }

          return Promise.reject(
            new Error(`Network Error.\n  Details: ${error}`)
          );
        }
      },
      {
        retries: retryOption ? MAX_RETRY_COUNT : 0,
        onRetry: (err, num) => {
          console.log(err);
          console.log(`Waiting for retry (${num}/${MAX_RETRY_COUNT})`);
        },
        minTimeout: MIN_TIMEOUT_MS,
      }
    );
  };

  /**
   * Get list and object API data for microCMS
   */
  const get = async <T = any>({
    endpoint,
    contentId,
    queries = {},
  }: GetRequest): Promise<T> => {
    if (!endpoint) {
      return Promise.reject(new Error('endpoint is required'));
    }
    return await makeRequest({ endpoint, contentId, queries });
  };

  /**
   * Get list API data for microCMS
   */
  const getList = async <T = any>({
    endpoint,
    queries = {},
  }: GetListRequest): Promise<MicroCMSListResponse<T>> => {
    if (!endpoint) {
      return Promise.reject(new Error('endpoint is required'));
    }
    return await makeRequest({ endpoint, queries });
  };

  /**
   * Get list API detail data for microCMS
   */
  const getListDetail = async <T = any>({
    endpoint,
    contentId,
    queries = {},
  }: GetListDetailRequest): Promise<T & MicroCMSListContent> => {
    if (!endpoint) {
      return Promise.reject(new Error('endpoint is required'));
    }
    return await makeRequest({
      endpoint,
      contentId,
      queries,
    });
  };

  /**
   * Get object API data for microCMS
   */
  const getObject = async <T = any>({
    endpoint,
    queries = {},
  }: GetObjectRequest): Promise<T & MicroCMSObjectContent> => {
    if (!endpoint) {
      return Promise.reject(new Error('endpoint is required'));
    }
    return await makeRequest({
      endpoint,
      queries,
    });
  };

  /**
   * Create new content in the microCMS list API data
   */
  const create = async <T extends Record<string | number, any>>({
    endpoint,
    contentId,
    content,
    isDraft = false,
  }: CreateRequest<T>): Promise<WriteApiRequestResult> => {
    if (!endpoint) {
      return Promise.reject(new Error('endpoint is required'));
    }

    const queries: MakeRequest['queries'] = isDraft ? { status: 'draft' } : {};
    const method: MakeRequest['method'] = contentId ? 'PUT' : 'POST';
    const customHeaders: MakeRequest['customHeaders'] = {
      'Content-Type': 'application/json',
    };
    const customBody: MakeRequest['customBody'] = JSON.stringify(content);

    return makeRequest({
      endpoint,
      contentId,
      queries,
      method,
      customHeaders,
      customBody,
    });
  };

  /**
   * Update content in their microCMS list and object API data
   */
  const update = async <T extends Record<string | number, any>>({
    endpoint,
    contentId,
    content,
  }: UpdateRequest<T>): Promise<WriteApiRequestResult> => {
    if (!endpoint) {
      return Promise.reject(new Error('endpoint is required'));
    }

    const method: MakeRequest['method'] = 'PATCH';
    const customHeaders: MakeRequest['customHeaders'] = {
      'Content-Type': 'application/json',
    };
    const customBody: MakeRequest['customBody'] = JSON.stringify(content);

    return makeRequest({
      endpoint,
      contentId,
      method,
      customHeaders,
      customBody,
    });
  };

  /**
   * Delete content in their microCMS list and object API data
   */
  const _delete = async ({
    endpoint,
    contentId,
  }: DeleteRequest): Promise<void> => {
    if (!endpoint) {
      return Promise.reject(new Error('endpoint is required'));
    }

    if (!contentId) {
      return Promise.reject(new Error('contentId is required'));
    }

    const method: MakeRequest['method'] = 'DELETE';

    await makeRequest({ endpoint, contentId, method });
  };

  return {
    get,
    getList,
    getListDetail,
    getObject,
    create,
    update,
    delete: _delete,
  };
};
