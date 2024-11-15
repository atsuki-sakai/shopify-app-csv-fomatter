import { useState, useEffect } from "react";
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
  Banner,
  Spinner,
  Box,
  Divider,
  ProgressBar,
  Tag,
  Combobox,
  Listbox,
} from "@shopify/polaris";

interface Customer {
  id: string;
  tags?: string[];
  email: string;
  firstName: string;
  lastName: string;
  note?: string;
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
                  note
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
      return json<ActionData>(
        { error: error.message || "顧客の検索中にエラーが発生しました。" },
        { status: 500 },
      );
    }
  } else if (formData.get("action") === "remove-customer-tag") {
    try {
      const removeTag = formData.get("removeTag") as string;
      const selectedCustomersJSON = formData.get("selectedCustomers") as string;
      const selectedCustomers = JSON.parse(selectedCustomersJSON);

      if (!removeTag || !selectedCustomers) {
        return json<ActionData>(
          { error: "必要な情報が不足しています。" },
          { status: 400 },
        );
      }

      const updatePromises = selectedCustomers.map((customer: Customer) =>
        admin.graphql(
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
                tags: customer.tags?.filter((tag) => tag !== removeTag) || [],
              },
            },
          },
        ),
      );

      await Promise.all(updatePromises);
      return json({
        success: true,
        message: `${selectedCustomers.length}件の顧客からタグ「${removeTag}」を削除しました。`,
      });
    } catch (error: any) {
      return json<ActionData>(
        { error: error.message || "タグの削除中にエラーが発生しました。" },
        { status: 500 },
      );
    }
  }

  return json<ActionData>({ error: "不明なアクションです。" }, { status: 400 });
};

export default function RemoveCustomerTag() {
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  let actionCustomers = actionData?.customers || [];
  const [selectedQuery, setSelectedQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedCustomerData, setSelectedCustomerData] = useState<Customer[]>(
    [],
  );
  const [removeTag, setRemoveTag] = useState("");
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  const isSearching = navigation.formData?.get("action") === "search-customer";
  const isRemovingTag =
    navigation.formData?.get("action") === "remove-customer-tag";
  const isProcessing = navigation.state === "submitting";

  const resourceName = {
    singular: "customer",
    plural: "customers",
  };

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(actionCustomers);

  // タグの選択肢を生成
  useEffect(() => {
    const allTags = new Set<string>();
    selectedCustomerData.forEach((customer) => {
      customer.tags?.forEach((tag) => allTags.add(tag));
    });
    setAvailableTags(Array.from(allTags));
  }, [selectedCustomerData]);

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
        <InlineStack gap="200" wrap>
          {customer.tags?.map((tag) => <Tag key={tag}>{tag}</Tag>) ?? (
            <Text as="p" tone="subdued">
              なし
            </Text>
          )}
        </InlineStack>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text variant="bodyMd" fontWeight="bold" as="span">
          {customer.note ?? "なし"}
        </Text>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  useEffect(() => {
    if (actionData?.error) {
      setError(actionData.error);
      setSuccessMessage(null);
    } else if (actionData?.message) {
      setSuccessMessage(actionData.message);
      setError(null);
      if (isRemovingTag) {
        setRemoveTag("");
        setSelectedCustomerData([]);
      }
    }
  }, [actionData]);

  useEffect(() => {
    const selectedCustomerData = actionCustomers.filter((customer) =>
      selectedResources.includes(customer.id),
    );
    setSelectedCustomerData(selectedCustomerData);
  }, [selectedResources]);

  return (
    <Page>
      <Text as="h1" variant="headingLg">
        顧客タグ削除
      </Text>
      <Layout.Section>
        <BlockStack gap="400">
          <Text as="h1" variant="headingLg">
            顧客タグを削除する
          </Text>

          {/* 処理状態の表示 */}
          {isProcessing && (
            <Box paddingBlock="400">
              <BlockStack gap="200">
                <Text as="p" alignment="center">
                  {isSearching ? "顧客を検索中..." : "タグを削除中..."}
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
              {/* 検索フォーム部分は同じ */}
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  顧客検索
                </Text>
                <Form method="POST">
                  <input type="hidden" name="action" value="search-customer" />
                  <BlockStack gap="400">
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
                        ・タグ: "HTシートマスクプレゼント対象者"
                      </Text>
                    </BlockStack>

                    <BlockStack gap="200">
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
                  </BlockStack>
                </Form>
              </BlockStack>
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
                      { title: "メモ" },
                    ]}
                    emptyState={
                      <Box padding="400">
                        <Text as="p" alignment="center" tone="subdued">
                          検索結果はありません
                        </Text>
                      </Box>
                    }
                  >
                    {rowMarkup}
                  </IndexTable>
                </Card>
              </BlockStack>

              <Divider />

              {/* タグ削除フォーム */}
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  タグの削除
                </Text>

                <Form method="POST">
                  <input
                    type="hidden"
                    name="action"
                    value="remove-customer-tag"
                  />
                  <BlockStack gap="400">
                    <Combobox
                      activator={
                        <Combobox.TextField
                          label="削除するタグ"
                          value={removeTag}
                          onChange={setRemoveTag}
                          autoComplete="off"
                          disabled={
                            isProcessing || selectedCustomerData.length === 0
                          }
                        />
                      }
                    >
                      {availableTags.length > 0 ? (
                        <Listbox onSelect={setRemoveTag}>
                          {availableTags.map((tag) => (
                            <Listbox.Option
                              key={tag}
                              value={tag}
                              selected={tag === removeTag}
                            >
                              {tag}
                            </Listbox.Option>
                          ))}
                        </Listbox>
                      ) : null}
                    </Combobox>

                    <input type="hidden" name="removeTag" value={removeTag} />
                    <input
                      type="hidden"
                      name="selectedCustomers"
                      value={JSON.stringify(selectedCustomerData)}
                    />

                    {selectedCustomerData.length > 0 && removeTag && (
                      <Banner tone="warning">
                        <BlockStack gap="200">
                          <Text as="p" variant="bodySm">
                            以下の操作を実行します：
                          </Text>
                          <Text as="p" variant="bodySm">
                            ・選択された{selectedCustomerData.length}
                            件の顧客から タグ「{removeTag}」を削除します
                          </Text>
                        </BlockStack>
                      </Banner>
                    )}

                    <Box>
                      <Button
                        variant="primary"
                        submit
                        tone="critical"
                        disabled={
                          isProcessing ||
                          !removeTag ||
                          selectedCustomerData.length === 0
                        }
                        loading={isRemovingTag}
                      >
                        {isRemovingTag
                          ? "タグ削除中..."
                          : `${selectedCustomerData.length}件の顧客からタグを削除`}
                      </Button>
                    </Box>
                  </BlockStack>
                </Form>
              </BlockStack>
            </BlockStack>
          </Card>
        </BlockStack>
      </Layout.Section>
    </Page>
  );
}
