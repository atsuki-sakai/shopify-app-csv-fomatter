import { useState, useEffect, useMemo, useCallback } from "react";
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useActionData, Form, useNavigation } from "@remix-run/react";

import { authenticate } from "../shopify.server";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  TextField,
  IndexTable,
  InlineStack,
  useIndexResourceState,
  Tag,
  Autocomplete,
  Banner,
  ProgressBar,
  Box,
  Divider,
  Spinner,
  EmptyState,
} from "@shopify/polaris";

interface Customer {
  id: string;
  tags?: string[];
  email: string;
  firstName: string;
  lastName: string;
}

interface ActionData {
  customers?: Customer[];
  error?: string;
  message?: string;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();

  if (formData.get("action") === "search-customer") {
    try {
      const selectedQuery = formData.get("query") as string;

      if (!selectedQuery) {
        return json<ActionData>(
          { error: "検索クエリが指定されていません。" },
          { status: 400 },
        );
      }

      const response = await admin.graphql(
        `#graphql
          query getCustomers($limit: Int!, $query: String!) {
            customers(first: $limit, query: $query) {
              edges {
                node {
                  id
                  email
                  firstName
                  lastName
                  tags
                }
              }
            }
          }`,
        {
          variables: {
            limit: 250,
            query: selectedQuery,
          },
        },
      );

      if (!response.ok) {
        throw new Error(`GraphQLエラー: ${response.statusText}`);
      }

      const responseJson = await response.json();
      const customers = responseJson.data.customers.edges.map(
        (edge: any) => edge.node,
      );

      return json<ActionData>({
        customers,
        message: `${customers.length}件の顧客が見つかりました。`,
      });
    } catch (error: any) {
      console.error("Search Error:", error);
      return json<ActionData>(
        { error: error.message || "顧客の検索中にエラーが発生しました。" },
        { status: 500 },
      );
    }
  } else if (formData.get("action") === "update-customer-tag") {
    try {
      const selectedTags = formData.get("selectedTags") as string;
      const selectedCustomersJSON = formData.get("selectedCustomers") as string;
      const selectedCustomers = JSON.parse(selectedCustomersJSON);
      const updateTag = formData.get("updateTag") as string;
      const tagsToRemove = selectedTags.split(",");

      if (!selectedTags || !selectedCustomers || !updateTag) {
        return json<ActionData>(
          { error: "必要な情報が不足しています。" },
          { status: 400 },
        );
      }

      if (updateTag.includes(" ")) {
        return json<ActionData>(
          { error: "タグにスペースを含めることはできません。" },
          { status: 400 },
        );
      }

      const updatePromises = selectedCustomers.map(
        async (customer: Customer) => {
          const updatedTags = [
            ...(customer.tags?.filter((tag) => !tagsToRemove.includes(tag)) ||
              []),
            updateTag,
          ];

          const response = await admin.graphql(
            `#graphql
          mutation updateCustomerTags($input: CustomerInput!) {
            customerUpdate(input: $input) {
              customer {
                id
                tags
              }
              userErrors {
                field
                message
              }
            }
          }`,
            {
              variables: {
                input: {
                  id: customer.id,
                  tags: updatedTags,
                },
              },
            },
          );

          if (!response.ok) {
            throw new Error(`タグの更新に失敗しました: ${response.statusText}`);
          }

          const result = await response.json();
          if (result.data.customerUpdate.userErrors.length > 0) {
            throw new Error(result.data.customerUpdate.userErrors[0].message);
          }

          return result;
        },
      );

      await Promise.all(updatePromises);
      return json({
        success: true,
        message: `${selectedCustomers.length}件の顧客のタグを「${updateTag}」に更新しました。`,
      });
    } catch (error: any) {
      return json<ActionData>(
        { error: error.message || "タグの更新中にエラーが発生しました。" },
        { status: 500 },
      );
    }
  }
};

export default function UpdateCustomerTag() {
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  let actionCustomers = actionData?.customers || [];

  const [selectedQuery, setSelectedQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [updateTag, setUpdateTag] = useState("");
  const [selectedCustomerTags, setSelectedCustomerTags] = useState<string[]>(
    [],
  );
  const [selectedCustomerData, setSelectedCustomerData] = useState<Customer[]>(
    [],
  );

  const isSearching = navigation.formData?.get("action") === "search-customer";
  const isUpdatingTag =
    navigation.formData?.get("action") === "update-customer-tag";
  const isProcessing = navigation.state === "submitting";

  const resourceName = {
    singular: "customer",
    plural: "customers",
  };

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(actionCustomers);

  const deselectedTags = useMemo(() => {
    const uniqueTagsSet = new Set(selectedCustomerTags);
    return Array.from(uniqueTagsSet).map((tag) => ({
      value: tag,
      label: tag,
    }));
  }, [selectedCustomerTags]);

  const removeTag = useCallback(
    (tag: string) => () => {
      setSelectedTags((prev) => prev.filter((t) => t !== tag));
    },
    [],
  );

  const rowMarkup = actionCustomers.map((customer: Customer, index: number) => (
    <IndexTable.Row
      id={customer.id}
      key={customer.id + "-" + index}
      selected={selectedCustomerData.includes(customer)}
      position={index}
    >
      <IndexTable.Cell>
        <Text variant="bodyMd" fontWeight="bold" as="span">
          {customer.id}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text variant="bodyMd" fontWeight="bold" as="span">
          {customer.lastName + customer.firstName}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text variant="bodyMd" fontWeight="bold" as="span">
          {customer.email}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <InlineStack gap="200" wrap={true}>
          {customer.tags?.map((tag) => <Tag key={tag}>{tag}</Tag>) ?? (
            <Text as="p" tone="subdued">
              タグなし
            </Text>
          )}
        </InlineStack>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  const verticalContentMarkup = selectedTags.length > 0 && (
    <BlockStack gap="200">
      {selectedTags.map((tag) => (
        <Tag key={tag} onRemove={removeTag(tag)}>
          {tag}
        </Tag>
      ))}
    </BlockStack>
  );

  const textField = (
    <Autocomplete.TextField
      label="変更前のタグ"
      placeholder="変更するタグを選択して下さい"
      verticalContent={verticalContentMarkup}
      autoComplete="off"
      disabled={isProcessing || selectedCustomerData.length === 0}
    />
  );

  useEffect(() => {
    if (actionData?.error) {
      setError(actionData.error);
      setSuccessMessage(null);
    } else if (actionData?.message) {
      setSuccessMessage(actionData.message);
      setError(null);
      if (isUpdatingTag) {
        setSelectedTags([]);
        setUpdateTag("");
      }
    }
  }, [actionData]);

  useEffect(() => {
    const selectedTags = actionCustomers
      .filter((customer) => selectedResources.includes(customer.id))
      .map((customer) => customer.tags)
      .flat()
      .filter((tag): tag is string => tag !== undefined && tag !== "");

    const uniqueTags = Array.from(new Set(selectedTags));
    setSelectedCustomerTags(uniqueTags);

    const selectedCustomerData = actionCustomers.filter((customer) =>
      selectedResources.includes(customer.id),
    );
    setSelectedCustomerData(selectedCustomerData);
  }, [selectedResources]);

  return (
    <Page>
      <Text as="h1" variant="headingLg">
        顧客タグ更新
      </Text>
      <Layout.Section>
        <BlockStack gap="400">
          {/* 処理状態の表示 */}
          {isProcessing && (
            <Box paddingBlock="400">
              <BlockStack gap="200">
                <Text as="p" alignment="center">
                  {isSearching ? "顧客を検索中..." : "タグを更新中..."}
                </Text>
                <ProgressBar progress={isProcessing ? 75 : 100} />
              </BlockStack>
            </Box>
          )}

          {/* メッセージ表示 */}
          {(error || successMessage) && (
            <Box paddingBlock="200">
              {error && (
                <Banner tone="critical" onDismiss={() => setError(null)}>
                  <p>{error}</p>
                </Banner>
              )}
              {successMessage && (
                <Banner
                  tone="success"
                  onDismiss={() => setSuccessMessage(null)}
                >
                  <p>{successMessage}</p>
                </Banner>
              )}
            </Box>
          )}

          <Card>
            <BlockStack gap="400">
              {/* 検索フォーム */}
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  顧客検索
                </Text>
                <Form method="POST">
                  <input type="hidden" name="action" value="search-customer" />
                  <BlockStack gap="200">
                    <InlineStack gap="200" blockAlign="end" wrap={false}>
                      <Box minWidth="320px">
                        <TextField
                          label="検索クエリ"
                          labelHidden
                          placeholder="顧客を検索..."
                          name="query"
                          maxLength={100}
                          autoComplete="off"
                          value={selectedQuery}
                          onChange={setSelectedQuery}
                          disabled={isProcessing}
                        />
                      </Box>
                      <Button
                        variant="primary"
                        submit
                        disabled={isProcessing || !selectedQuery}
                        loading={isSearching}
                      >
                        検索
                      </Button>
                    </InlineStack>

                    <BlockStack gap="200">
                      <Text as="h3" variant="headingSm">
                        検索例:
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        ・メールアドレス: "test@example.com"
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        ・お名前: "山田 太郎"
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        ・タグ: "HT シートマスクプレゼント対象者"
                      </Text>
                    </BlockStack>
                    <Text as="p" variant="bodySm" tone="critical">
                      <Text as="span" variant="bodySm" fontWeight="bold">
                        検索クエリ
                      </Text>
                      はタグのみを参照している訳ではありません。顧客の持つデータからクエリの文字列を含む顧客を検索します。検索結果は250件までです。
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      指定の顧客のみに絞り込みたい場合は複数のクエリを入力して検索クエリを絞り込んでください。
                    </Text>
                  </BlockStack>
                </Form>
              </BlockStack>

              <Divider />

              {/* 検索結果テーブル */}
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">
                    検索結果 ({actionCustomers.length}件)
                  </Text>
                  {isSearching && <Spinner size="small" />}
                </InlineStack>

                <Card>
                  <IndexTable
                    resourceName={resourceName}
                    itemCount={actionCustomers.length}
                    selectedItemsCount={
                      allResourcesSelected ? "All" : selectedCustomerData.length
                    }
                    onSelectionChange={handleSelectionChange}
                    headings={[
                      { title: "ID" },
                      { title: "お名前" },
                      { title: "メールアドレス" },
                      { title: "タグ" },
                    ]}
                    emptyState={
                      <Box padding="400">
                        <EmptyState heading="顧客が見つかりません" image="">
                          <p>検索条件を変更して再度お試しください。</p>
                        </EmptyState>
                      </Box>
                    }
                  >
                    {rowMarkup}
                  </IndexTable>
                </Card>
              </BlockStack>

              <Divider />

              {/* タグ更新フォーム */}
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  タグの更新
                </Text>

                <Card>
                  <BlockStack gap="400">
                    <Text as="p" variant="bodySm">
                      1. 顧客を選択し、更新したいタグを選んでください。
                      <br />
                      2. 新しいタグを入力して更新を実行します。
                    </Text>

                    <Box paddingBlockEnd="400">
                      <InlineStack gap="200" align="start" wrap={false}>
                        <Box width="50%">
                          <Autocomplete
                            allowMultiple={false}
                            options={deselectedTags}
                            selected={selectedTags}
                            textField={textField}
                            onSelect={setSelectedTags}
                            listTitle="利用可能なタグ"
                          />
                        </Box>
                        <Box width="50%">
                          <Form method="POST">
                            <input
                              type="hidden"
                              name="action"
                              value="update-customer-tag"
                            />
                            <input
                              type="hidden"
                              name="selectedTags"
                              value={selectedTags.join(",")}
                            />
                            <input
                              type="hidden"
                              name="selectedCustomers"
                              value={JSON.stringify(
                                selectedCustomerData.map((customer) => ({
                                  id: customer.id,
                                  tags: customer.tags,
                                })),
                              )}
                            />
                            <BlockStack gap="400">
                              <TextField
                                label="変更後のタグ"
                                name="updateTag"
                                autoComplete="off"
                                value={updateTag}
                                onChange={setUpdateTag}
                                disabled={
                                  isProcessing || selectedTags.length === 0
                                }
                                helpText={
                                  selectedCustomerData.length > 0
                                    ? `${selectedCustomerData.length}件の顧客のタグを更新します`
                                    : "タグを更新する顧客を選択してください"
                                }
                              />
                              <Box>
                                <Button
                                  variant="primary"
                                  submit
                                  disabled={
                                    isProcessing ||
                                    !updateTag ||
                                    selectedTags.length === 0 ||
                                    selectedCustomerData.length === 0
                                  }
                                  loading={isUpdatingTag}
                                >
                                  {isUpdatingTag
                                    ? "タグを更新中..."
                                    : `${selectedCustomerData.length}件の顧客のタグを更新`}
                                </Button>
                              </Box>
                            </BlockStack>
                          </Form>
                        </Box>
                      </InlineStack>

                      <Box paddingBlockStart="400">
                        <BlockStack gap="200">
                          <Text as="h3" variant="headingSm">
                            タグの更新例:
                          </Text>
                          <InlineStack gap="200" align="center">
                            <Box
                              background="bg-surface-secondary"
                              padding="200"
                              borderRadius="200"
                            >
                              <Text as="p" variant="bodySm">
                                {selectedTags.join(",")}
                              </Text>
                            </Box>
                            <Text as="p" variant="bodySm">
                              →
                            </Text>
                            <Box
                              background="bg-surface-secondary"
                              padding="200"
                              borderRadius="200"
                            >
                              <Text as="p" variant="bodySm">
                                {updateTag}
                              </Text>
                            </Box>
                          </InlineStack>
                        </BlockStack>
                      </Box>

                      {selectedCustomerData.length > 0 &&
                        selectedTags.length > 0 && (
                          <Box paddingBlockStart="400">
                            <Banner tone="warning">
                              <BlockStack gap="200">
                                <Text as="p" variant="bodySm">
                                  以下の処理が実行されます:
                                </Text>
                                <Text as="p" variant="bodySm">
                                  ・選択された{selectedCustomerData.length}
                                  件の顧客から
                                  {selectedTags.length > 1 ? "タグ「" : ""}
                                  {selectedTags.join("」「")}
                                  {selectedTags.length > 1 ? "」" : ""}を除去
                                </Text>
                                <Text as="p" variant="bodySm">
                                  ・新しいタグ「{updateTag || "未入力"}」を追加
                                </Text>
                              </BlockStack>
                            </Banner>
                          </Box>
                        )}
                    </Box>
                  </BlockStack>
                </Card>
              </BlockStack>
            </BlockStack>
          </Card>
        </BlockStack>
      </Layout.Section>
    </Page>
  );
}
