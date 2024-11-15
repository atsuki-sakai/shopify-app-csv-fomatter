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
  Spinner,
  Banner,
} from "@shopify/polaris";

import { authenticate } from "../shopify.server";

// - Type
interface ShippingAddress {
  zip?: string;
  name?: string;
  phone?: string;
  province?: string;
  city?: string;
  address1?: string;
  address2?: string;
}

interface Customer {
  id: string;
  email: string;
  lastName: string;
  firstName: string;
  tags?: string;
  addresses: ShippingAddress[];
}

interface ActionData {
  customers?: Customer[];
  error?: string;
  message?: string;
}

// - Function

function _convertPhoneNumber(phone: string) {
  console.log(phone);
  if (typeof phone !== "string") {
    throw new TypeError("電話番号は文字列でなければなりません。");
  }

  // // Remove spaces and hyphens
  phone = phone.replace(/[-\s]/g, "");

  //先頭が+81の場合は0に変換
  if (phone.startsWith("+81")) {
    phone = "0" + phone.slice(3);
  }

  // 電話番号を後ろから４桁区切りでハイフン　※09012345678 -> 9012345678になってしまう問題の修正
  // 09012345678 -> 090-1234-5678
  phone = phone.slice(0, -4) + "-" + phone.slice(-4);

  return phone;
}

function _covertProvince(province: string) {
  switch (province) {
    case "Aichi":
      return "愛知県";
    case "Akita":
      return "秋田県";
    case "Aomori":
      return "青森県";
    case "Chiba":
      return "千葉県";
    case "Ehime":
      return "愛媛県";
    case "Fukui":
      return "福井県";
    case "Fukuoka":
      return "福岡県";
    case "Fukushima":
      return "福島県";
    case "Gifu":
      return "岐阜県";
    case "Gunma":
      return "群馬県";
    case "Hiroshima":
      return "広島県";
    case "Hokkaidō":
      return "北海道";
    case "Hyōgo":
      return "兵庫県";
    case "Ibaraki":
      return "茨城県";
    case "Ishikawa":
      return "石川県";
    case "Iwate":
      return "岩手県";
    case "Kagawa":
      return "香川県";
    case "Yamanashi":
      return "山梨県";
    case "Yamaguchi":
      return "山口県";
    case "Kōchi":
      return "高知県";
    case "Kumamoto":
      return "熊本県";
    case "Kyōto":
      return "京都府";
    case "Mie":
      return "三重県";
    case "Yamagata":
      return "山形県";
    case "Miyazaki":
      return "宮崎県";
    case "Nagano":
      return "長野県";
    case "Nagasaki":
      return "長崎県";
    case "Nara":
      return "奈良県";
    case "Niigata":
      return "新潟県";
    case "Ōita":
      return "大分県";
    case "Okayama":
      return "岡山県";
    case "Okinawa":
      return "沖縄県";
    case "Ōsaka":
      return "大阪府";
    case "Saga":
      return "佐賀県";
    case "Saitama":
      return "埼玉県";
    case "Shiga":
      return "滋賀県";
    case "Shimane":
      return "島根県";
    case "Shizuoka":
      return "静岡県";
    case "Tochigi":
      return "栃木県";
    case "Tokushima":
      return "徳島県";
    case "Tottori":
      return "鳥取県";
    case "Toyama":
      return "富山県";
    case "Tōkyō":
      return "東京都";
    case "Miyagi":
      return "宮城県";
    case "Wakayama":
      return "和歌山県";
    case "Kanagawa":
      return "神奈川県";
    case "Kagoshima":
      return "鹿児島県";
    default:
      return "";
  }
}

function _exportCustomerCSVData(customers: Customer[]) {
  console.log(customers);
  const csvData = [
    [
      "ID",
      "タグ",
      "お名前",
      "メールアドレス",
      "電話番号",
      "郵便番号",
      "都道府県",
      "市区町村",
      "住所1",
      "住所2",
    ],
    ...customers.map((customer: Customer) => [
      customer.id.split("/Customer/")[1],
      customer.tags
        ? Array.isArray(customer.tags)
          ? customer.tags.join(" ")
          : customer.tags
              .split(",")
              .map((tag) => tag.trim())
              .join(",")
        : "",
      customer.lastName + customer.firstName,
      customer.email,
      customer.addresses?.[0]?.phone
        ? _convertPhoneNumber(customer.addresses[0].phone)
        : "",
      customer.addresses?.[0]?.zip ?? "",
      customer.addresses?.[0]?.province
        ? _covertProvince(customer.addresses[0].province)
        : "",
      customer.addresses?.[0]?.city ?? "",
      customer.addresses?.[0]?.address1 ?? "",
      customer.addresses?.[0]?.address2 ?? "",
    ]),
  ];
  console.log(csvData);
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
  link.setAttribute("download", "customers-data.csv");

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
    const selectedQuery = formData.get("query") as string;

    if (!selectedQuery) {
      return json<ActionData>(
        { error: "クエリが指定されていません。" },
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
            tags
            lastName
            firstName
            email
            addresses{
              name
              phone
              zip
              country
              province
              city
              address1
              address2
              lastName
              firstName
            }
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

    return json<ActionData>({
      customers: responseJson.data.customers.edges.map(
        (edge: any) => edge.node,
      ),
      message: "顧客データを取得しました。",
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
  const actionCustomers = actionData?.customers || [];
  const [selectedQuery, setSelectedQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  // ナビゲーション状態を監視してローディング状態を管理
  const isLoading = navigation.state === "submitting";

  useEffect(() => {
    if (actionData?.error) {
      setError(actionData.error);
    } else {
      setError(null);
    }
  }, [actionData]);

  const resourceName = {
    singular: "customer",
    plural: "customers",
  };

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(actionCustomers);

  const rowMarkup = actionCustomers.map((customer: Customer, index: number) => {
    const address =
      customer.addresses && customer.addresses.length > 0
        ? customer.addresses[0]
        : {};
    return (
      <IndexTable.Row
        id={customer.id}
        key={customer.id + "-" + index}
        selected={selectedResources.includes(customer.id)}
        position={index}
      >
        <IndexTable.Cell>
          <Text variant="bodyMd" fontWeight="bold" as="span">
            {customer.lastName + customer.firstName}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>{customer.email}</IndexTable.Cell>
        <IndexTable.Cell>{customer.tags ?? ""}</IndexTable.Cell>
        <IndexTable.Cell>{address.zip ?? ""}</IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span" alignment="end" numeric>
            {address.phone ?? ""}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          {_covertProvince(address.province ?? "")}
        </IndexTable.Cell>
        <IndexTable.Cell>{address.city ?? ""}</IndexTable.Cell>
        <IndexTable.Cell>{address.address1 ?? ""}</IndexTable.Cell>
        <IndexTable.Cell>{address.address2 ?? ""}</IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  const handleExportCSV = async () => {
    try {
      setIsExporting(true);
      const selectedCustomers = actionCustomers.filter((customer: Customer) =>
        selectedResources.includes(customer.id),
      );
      await _exportCustomerCSVData(selectedCustomers);
    } catch (error) {
      setError("CSVエクスポート中にエラーが発生しました。");
    } finally {
      setIsExporting(false);
    }
  };

  const isExportDisabled = selectedResources.length === 0 || isExporting;

  return (
    <Page>
      <Text as="h1" variant="headingLg">
        顧客データCSV変換
      </Text>
      <Layout.Section>
        <BlockStack gap="500">
          <Form method="post">
            <BlockStack gap="200">
              <Card>
                <TextField
                  autoComplete="off"
                  label="顧客クエリ"
                  name="query"
                  value={selectedQuery}
                  onChange={setSelectedQuery}
                  disabled={isLoading}
                />
              </Card>
              <div>
                <BlockStack gap="200">
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
                  <Text as="p" variant="bodySm" tone="critical">
                    <Text as="span" variant="bodySm" fontWeight="bold">
                      検索クエリ
                    </Text>
                    はタグのみを参照している訳ではありません。顧客の持つデータからクエリの文字列を含む顧客を検索します。検索結果は250件までです。
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    指定の顧客のみに絞り込みたい場合は複数のクエリを入力して検索クエリを絞り込んでください。
                  </Text>
                  <Button
                    submit
                    variant="primary"
                    loading={isLoading}
                    disabled={!selectedQuery.trim() || isLoading}
                  >
                    {isLoading ? "検索中..." : "クエリで検索する"}
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

          <BlockStack gap="500">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" tone="base">
                  一致した顧客
                  {isLoading && (
                    <span style={{ marginLeft: "8px" }}>
                      <Spinner size="small" />
                    </span>
                  )}
                </Text>
                <Card>
                  <IndexTable
                    resourceName={resourceName}
                    itemCount={actionCustomers.length}
                    selectedItemsCount={
                      allResourcesSelected ? "All" : selectedResources.length
                    }
                    onSelectionChange={handleSelectionChange}
                    headings={[
                      { title: "お名前" },
                      { title: "メールアドレス" },
                      { title: "タグ" },
                      { title: "郵便番号" },
                      { title: "電話番号" },
                      { title: "都道府県" },
                      { title: "市区町村" },
                      { title: "住所1" },
                      { title: "詳細住所" },
                    ]}
                    loading={isLoading}
                  >
                    {rowMarkup}
                  </IndexTable>
                </Card>
              </BlockStack>
            </Card>
          </BlockStack>

          <Button
            onClick={handleExportCSV}
            variant="primary"
            loading={isExporting}
            disabled={isExportDisabled}
          >
            {isExporting
              ? "エクスポート中..."
              : `顧客データをCSVで出力する ${
                  selectedResources.length > 0
                    ? `(${selectedResources.length}件選択中)`
                    : ""
                }`}
          </Button>
          <Text as="span" alignment="start" tone="subdued">
            ボタンを押すとCSVファイルがダウンロードされます。
          </Text>
        </BlockStack>
      </Layout.Section>
    </Page>
  );
}
