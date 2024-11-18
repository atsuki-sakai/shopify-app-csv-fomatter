import { useState, useEffect } from "react";
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useActionData, Form, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  TextField,
  IndexTable,
  useIndexResourceState,
  Loading,
  Banner,
  Frame,
} from "@shopify/polaris";

import { authenticate } from "../shopify.server";

// - Type
interface b2bAffiliateOrderCustomer {
  email: string;
  lastName: string;
  firstName: string;
}

interface Order {
  id: string;
  tags?: string[];
  createdAt: string;
  lineItems: {
    edges: {
      node: {
        title: string;
        quantity: number;
        originalUnitPriceSet: {
          shopMoney: {
            amount: string;
          };
        };
      };
    }[];
  };
  customer: b2bAffiliateOrderCustomer;
}

interface ActionData {
  orders?: Order[];
  error?: string;
  message?: string;
}

// - Function

function _b2bAffiliateOrderCSVData(
  orders: Order[],
  searchTag: string,
  commission: string,
) {
  const csvData = [
    [
      "注文日",
      "お名前",
      "メールアドレス",
      "注文タグ",
      "合計商品金額",
      "注文商品",
    ],
    ...orders.map((order: any) => [
      order.createdAt.split("T")[0],
      order.customer.lastName + order.customer.firstName,
      order.customer.email,
      order.tags?.join("、") ?? "",
      order.lineItems.edges
        .reduce(
          (sum: any, edge: any) =>
            sum + parseFloat(edge.node.originalUnitPriceSet.shopMoney.amount),
          0,
        )
        .toFixed(1),
      order.lineItems.edges
        .map(
          (edge: any) =>
            edge.node.title +
            "、 価格: ¥" +
            edge.node.originalUnitPriceSet.shopMoney.amount +
            "、 数量: " +
            edge.node.quantity +
            "点、",
        )
        .join("、"),
    ]),
    [""],
    [
      "合計金額",
      orders
        .reduce(
          (sum, order) =>
            sum +
            order.lineItems.edges.reduce(
              (sum, edge) =>
                sum +
                parseFloat(edge.node.originalUnitPriceSet.shopMoney.amount),
              0,
            ),
          0,
        )
        .toFixed(1),
    ],
    [
      `お支払い金額(${commission}%)`,
      (orders.reduce(
        (sum, order) =>
          sum +
          order.lineItems.edges.reduce(
            (sum, edge) =>
              sum + parseFloat(edge.node.originalUnitPriceSet.shopMoney.amount),
            0,
          ),
        0,
      ) *
        parseFloat(commission)) /
        100,
    ],
  ];
  const csvContent = csvData.map((e) => e.join(",")).join("\n");

  // Add BOM to the CSV content
  const BOM = "\uFEFF";
  const csvContentWithBOM = BOM + csvContent;

  // Create a Blob from the CSV string with UTF-8 encoding
  const blob = new Blob([csvContentWithBOM], {
    type: "text/csv;charset=utf-8;",
  });

  // Create a link to download the Blob
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `b2b_affiliate_orders.csv`);

  // Append to the document and trigger the download
  document.body.appendChild(link);
  link.click();

  // Clean up
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  console.log("Export CSV");
}

// - Action
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { admin } = await authenticate.admin(request);
    const formData = await request.formData();
    const searchTag = formData.get("tag") as string;
    const excludeTag = formData.get("excludeTag") as string;
    // タグ更新処理
    if (formData.get("intent") === "updateTags") {
      const selectedOrdersData = JSON.parse(formData.get("orderIds") as string);
      const addTag = "コミッション支払い済み";

      const updatePromises = selectedOrdersData.map(
        async (orderData: { orderId: string; orderTags: string }) => {
          const response = await admin.graphql(
            `#graphql
            mutation orderUpdate($input: OrderInput!) {
              orderUpdate(input: $input) {
                order {
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
                  id: orderData.orderId,
                  tags: `${orderData.orderTags},${addTag}`,
                },
              },
            },
          );

          if (!response.ok) {
            throw new Error(`タグの更新に失敗しました: ${response.statusText}`);
          }

          const result = await response.json();
          if (result.data.orderUpdate.userErrors.length > 0) {
            throw new Error(result.data.orderUpdate.userErrors[0].message);
          }

          return result;
        },
      );

      await Promise.all(updatePromises);
      return json({
        success: true,
        message: `${selectedOrdersData.length}件の注文に「${addTag}」を追加しました。`,
      });
    }

    // 注文検索処理
    if (!searchTag) {
      return json<ActionData>(
        { error: "タグが指定されていません。" },
        { status: 400 },
      );
    }

    const response = await admin.graphql(
      `#graphql
        query getB2BOrders($limit: Int!, $query: String) {
          orders(first: $limit, query: $query) {
            edges {
              node {
                customer {
                  email
                  firstName
                  lastName
                }
                id
                tags
                createdAt
                lineItems(first: 100) {
                  edges {
                    node {
                      id
                      title
                      quantity
                      originalUnitPriceSet {
                        shopMoney {
                          amount
                        }
                      }
                    }
                  }
                }
                totalPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
              }
            }
          }
        }`,
      {
        variables: {
          limit: 250,
          query: `tag:${searchTag} AND financial_status:paid AND NOT tag:${excludeTag}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(`GraphQLエラー: ${response.statusText}`);
    }

    const responseJson = await response.json();

    return json<ActionData>({
      orders: responseJson.data.orders.edges.map((edge: any) => edge.node),
    });
  } catch (error: any) {
    console.error("Action Error:", error);
    return json<ActionData>(
      { error: error.message || "不明なエラーが発生しました。" },
      { status: 500 },
    );
  }
};

// - Component

export default function Index() {
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const actionOrders = actionData?.orders || [];
  const [searchTag, setSearchTag] = useState("");
  const [excludeTag, setExcludeTag] = useState("");
  const [commission, setCommission] = useState("10");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const isLoading = navigation.state === "submitting";

  useEffect(() => {
    if (actionData?.error) {
      setError(actionData.error);
      setMessage(null);
    } else {
      setError(null);
      setMessage(actionData?.message || null);
      setIsExporting(false);
      setSearchTag("");
      setExcludeTag("");
    }
  }, [actionData]);

  const resourceName = {
    singular: "order",
    plural: "orders",
  };

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(actionOrders);

  const rowMarkup = actionOrders.map((order: Order, index: number) => {
    return (
      <IndexTable.Row
        id={order.id}
        key={order.id + "-" + index}
        selected={selectedResources.includes(order.id)}
        position={index}
      >
        <IndexTable.Cell>{order.createdAt.split("T")[0]}</IndexTable.Cell>
        <IndexTable.Cell>
          <Text variant="bodyMd" fontWeight="bold" as="span">
            {order.customer.lastName + order.customer.firstName}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>{order.customer.email}</IndexTable.Cell>
        <IndexTable.Cell>{order.tags ?? ""}</IndexTable.Cell>
        <IndexTable.Cell>
          ¥
          {order.lineItems.edges
            .reduce(
              (sum, edge) =>
                sum +
                parseFloat(edge.node.originalUnitPriceSet.shopMoney.amount),
              0,
            )
            .toFixed(1)}
        </IndexTable.Cell>
        <IndexTable.Cell>
          {order.lineItems.edges
            .map(
              (edge: any) =>
                edge.node.title +
                "、 価格: ¥" +
                edge.node.originalUnitPriceSet.shopMoney.amount +
                "、 数量: " +
                edge.node.quantity +
                "点、",
            )
            .join("、")}
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  const handleExportCSV = async () => {
    try {
      setIsExporting(true);
      const selectedOrders = actionOrders.filter((order: any) =>
        selectedResources.includes(order.id),
      );
      _b2bAffiliateOrderCSVData(selectedOrders, searchTag, commission);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Frame>
      {(isLoading || isExporting) && <Loading />}
      <Page>
        {message && (
          <Banner onDismiss={() => setMessage(null)}>
            <p>{message}</p>
          </Banner>
        )}
        <Text as="h1" variant="headingLg">
          B2Bアフィリエイト注文データCSV出力
        </Text>
        <Layout.Section>
          <BlockStack gap="500">
            <Form method="post">
              <BlockStack gap="200">
                <Card>
                  <TextField
                    autoComplete="off"
                    label="B2Bアフィリエイトタグ"
                    name="tag"
                    value={searchTag}
                    onChange={(value) => setSearchTag(value)}
                    disabled={isLoading}
                  />
                  <TextField
                    autoComplete="off"
                    label="以下のタグを含む注文を除外する"
                    name="excludeTag"
                    value={excludeTag}
                    onChange={(value) => setExcludeTag(value)}
                    disabled={isLoading}
                  />
                </Card>
                <div>
                  <BlockStack gap="200">
                    <Text as="span" alignment="start" tone="subdued">
                      取得したい注文のタグを入力してください。
                    </Text>
                    <Button
                      submit
                      variant="primary"
                      loading={isLoading}
                      disabled={isLoading || !searchTag}
                    >
                      {isLoading ? "検索中..." : "検索する"}
                    </Button>
                  </BlockStack>
                </div>
              </BlockStack>
            </Form>

            {error && (
              <Banner onDismiss={() => setError(null)}>
                <p>{error}</p>
              </Banner>
            )}

            {actionOrders.length > 0 && (
              <BlockStack gap="500">
                <Card>
                  <BlockStack gap="200">
                    <Text as="h2" tone="base">
                      一致した注文 ({actionOrders.length}件)
                    </Text>
                    <Card>
                      <IndexTable
                        resourceName={resourceName}
                        itemCount={actionOrders.length}
                        selectedItemsCount={
                          allResourcesSelected
                            ? "All"
                            : selectedResources.length
                        }
                        onSelectionChange={handleSelectionChange}
                        headings={[
                          { title: "注文日" },
                          { title: "お名前" },
                          { title: "メールアドレス" },
                          { title: "注文タグ" },
                          { title: "合計商品金額" },
                          { title: "注文商品" },
                        ]}
                      >
                        {rowMarkup}
                      </IndexTable>
                    </Card>
                  </BlockStack>
                </Card>
                <TextField
                  type="number"
                  autoComplete="off"
                  label="コミッション"
                  name="commission"
                  value={commission}
                  suffix="%"
                  onChange={(value) => setCommission(value)}
                />
                <Text as="span" alignment="start" tone="critical">
                  ボタンを押すとCSVがダウンロードされ、選択した注文のタグに
                  「コミッション支払い済み」が追加されます。
                </Text>
                <Form method="post">
                  <input type="hidden" name="intent" value="updateTags" />
                  <input
                    type="hidden"
                    name="orderIds"
                    value={JSON.stringify(
                      actionOrders.map((order: Order) => ({
                        orderId: order.id,
                        orderTags: order.tags?.join(",") ?? "",
                      })),
                    )}
                  />

                  <Button
                    submit
                    variant="primary"
                    onClick={handleExportCSV}
                    loading={isExporting}
                    disabled={isExporting || selectedResources.length === 0}
                  >
                    {isExporting ? "出力中..." : "CSVを出力する"}
                  </Button>
                </Form>
              </BlockStack>
            )}
          </BlockStack>
        </Layout.Section>
      </Page>
    </Frame>
  );
}
