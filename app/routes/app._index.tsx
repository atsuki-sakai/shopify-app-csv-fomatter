import { useState, useEffect } from "react";
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useActionData, Form } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  TextField,
  IndexTable,
  RadioButton,
  useIndexResourceState,
  Select,
  InlineStack,
} from "@shopify/polaris";

import { authenticate } from "../shopify.server";

import * as XLSX from "xlsx";

// - Type
interface ShippingAddress {
  zip: string;
  name: string;
  phone: string;
  province: string;
  city: string;
  address1: string;
  address2?: string;
}

interface Order {
  id: string;
  email: string;
  shippingAddress: ShippingAddress;
}

interface ActionData {
  orders?: Order[];
  error?: string;
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

function _formatString(str: string | null | undefined) {
  if (typeof str !== "string") {
    return "";
  }
  return str.replace(/\s+/g, "");
}

function _formatShipAndCoTime(order: any) {
  const time =
    order.customAttributes.find(
      (attr: any) => attr.key === "shipandco-配達希望時間帯",
    )?.value ?? "";
  console.log(time);
  switch (time) {
    case "午前中（12時まで）":
      return "0812";
    case "before-noon":
      return "0812";
    case "14-16":
      return "1416";
    case "16-18":
      return "1618";
    case "18-20":
      return "1820";
    case "19-21":
      return "1921";
    default:
      return "";
  }
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

function _yamatoCSVData(orders: any[], invoiceType: string) {
  const csvData = [
    [
      "お客様管理番号",
      "送り状種類",
      "クール区分",
      "伝票番号",
      "出荷予定日",
      "お届け予定日",
      "配達時間帯",
      "お届け先コード",
      "お届け先電話番号",
      "お届け先電話番号枝番",
      "お届け先郵便番号",
      "お届け先住所",
      "お届け先アパートマンション名",
      "お届け先会社・部門１",
      "お届け先会社・部門２",
      "お届け先名",
      "お届け先名(ｶﾅ)",
      "敬称",
      "ご依頼主コード",
      "ご依頼主電話番号",
      "ご依頼主電話番号枝番",
      "ご依頼主郵便番号",
      "ご依頼主住所",
      "ご依頼主アパートマンション名",
      "ご依頼主名",
      "ご依頼主名(カナ)",
      "品目コード１",
      "品名１",
      "品名２",
      "荷扱い1",
      "荷扱い2",
      "記事",
      "ｺﾚｸﾄ代金引換額（税込)",
      "内消費税額等",
      "止置き",
      "営業所コード",
      "発行枚数",
      "個数口表示フラグ",
      "請求先顧客コード",
      "請求先分類コード",
      "運賃管理番号",
      "クロネコwebコレクトデータ登録",
      "クロネコwebコレクト加盟店番号",
      "クロネコwebコレクト申込受付番号１",
      "クロネコwebコレクト申込受付番号２",
      "クロネコwebコレクト申込受付番号３",
      "お届け予定ｅメール利用区分",
      "お届け予定ｅメールe-mailアドレス",
      "入力機種",
      "お届け予定ｅメールメッセージ",
      "お届け完了ｅメール利用区分",
      "お届け完了ｅメールe-mailアドレス",
      "お届け完了ｅメールメッセージ",
      "クロネコ収納代行利用区分",
      "予備",
      "収納代行請求金額(税込)",
      "収納代行内消費税額等",
      "収納代行請求先郵便番号",
      "収納代行請求先住所",
      "収納代行請求先住所（アパートマンション名）",
      "収納代行請求先会社・部門名１",
      "収納代行請求先会社・部門名２",
      "収納代行請求先名(漢字)",
      "収納代行請求先名(カナ)",
      "収納代行問合せ先名(漢字)",
      "収納代行問合せ先郵便番号",
      "収納代行問合せ先住所",
      "収納代行問合せ先住所（アパートマンション名）",
      "収納代行問合せ先電話番号",
      "収納代行管理番号",
      "収納代行品名",
      "収納代行備考",
      "複数口くくりキー",
      "検索キータイトル1",
      "検索キー1",
      "検索キータイトル2",
      "検索キー2",
      "検索キータイトル3",
      "検索キー3",
      "検索キータイトル4",
      "検索キー4",
      "検索キータイトル5",
      "検索キー5",
      "予備",
      "予備",
      "投函予定メール利用区分",
      "投函予定メールe-mailアドレス",
      "投函予定メールメッセージ",
      "予備",
      "投函完了メール（お届け先宛）利用区分",
      "投函完了メール（お届け先宛）e-mailアドレス",
      "投函完了メール（お届け先宛）メールメッセージ",
      "投函完了メール（ご依頼主宛）利用区分",
      "投函完了メール（ご依頼主宛）e-mailアドレス",
      "投函完了メール（ご依頼主宛）メールメッセージ",
    ],
    ...orders.map((order: any) => [
      "",
      invoiceType,
      "",
      "",
      new Date().toLocaleDateString("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }),
      order.customAttributes
        .find((attr: any) => attr.key === "shipandco-配達希望日")
        ?.value.replace(/-/g, "/") ?? "",
      _formatShipAndCoTime(order),
      "",
      _convertPhoneNumber(order.shippingAddress.phone),
      "",
      order.shippingAddress.zip,
      _covertProvince(order.shippingAddress.province) +
        order.shippingAddress.city +
        order.shippingAddress.address1,
      order.shippingAddress.address2 ?? "",
      "",
      "",
      order.shippingAddress.lastName + order.shippingAddress.firstName,
      "",
      "",
      "",
      "06-6352-0156",
      "",
      "5300044",
      "大阪府大阪市北区東天満1-10-20",
      "ECC本社ビル4F",
      "株式会社ECC",
      "",
      "",
      "化粧品",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "0663520156",
      "",
      "01",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ]),
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
  link.setAttribute("download", "yamato_orders.csv");

  // Append to the document and trigger the download
  document.body.appendChild(link);
  link.click();

  // Clean up
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  console.log("Export CSV");
}

function _seinoCSVData(orders: any[], invoiceType: string) {
  let currentDate = new Date();
  currentDate.setDate(currentDate.getDate() + 3);

  const data = orders.map((order: any) => [
    "0663520156",
    "",
    "",
    "",
    "ECC" + order.id.split("Order/")[1].toString().slice(0, 17),
    1,
    "",
    1,
    "",
    "",
    "",
    "株式会社 ECC",
    "大阪府 大阪市北区 東天満 1-10-20",
    "ECC本社ビル4F",
    "0663520156",
    "",
    "",
    "",
    order.shippingAddress.zip.replace("-", ""),
    order.shippingAddress.lastName + order.shippingAddress.firstName,
    "",
    _covertProvince(_formatString(order.shippingAddress.province)) +
      _formatString(order.shippingAddress.city) +
      _formatString(order.shippingAddress.address1) +
      _formatString(order.shippingAddress.address2),
    "",
    _convertPhoneNumber(order.shippingAddress.phone),
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    order.email,
  ]);

  // Create a worksheet from the data
  const worksheet = XLSX.utils.aoa_to_sheet(data);

  // Create a new workbook and append the worksheet
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Orders");

  // Write the workbook to a binary string
  const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });

  // Add BOM to the Excel buffer
  const BOM = new Uint8Array([0xef, 0xbb, 0xbf]);
  const excelBufferWithBOM = new Uint8Array(
    BOM.byteLength + excelBuffer.byteLength,
  );
  excelBufferWithBOM.set(BOM, 0);
  excelBufferWithBOM.set(new Uint8Array(excelBuffer), BOM.byteLength);

  // Create a Blob from the binary string with UTF-8 encoding
  const blob = new Blob([excelBufferWithBOM], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=utf-8;",
  });

  // Create a link element
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.setAttribute("download", "seino_orders.xlsx");

  // Append to the document and trigger the download
  document.body.appendChild(link);
  link.click();

  // Clean up
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

// Const
const invoiceTypeOptions = [
  { label: "発払い", value: "0" },
  { label: "コレクト", value: "2" },
  { label: "クロネコゆうメール", value: "3" },
  { label: "タイム", value: "4" },
  { label: "着払い", value: "5" },
  { label: "発払い（複数口）", value: "6" },
  { label: "ネコポス・クロネコゆうパケット", value: "7" },
  { label: "宅急便コンパクト", value: "8" },
  { label: "宅急便コンパクトコレクト", value: "9" },
  { label: "ネコポス（1月末にてサービス終了）", value: "A" },
];

// - Action
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { admin } = await authenticate.admin(request);
    const formData = await request.formData();
    const selectedTag = formData.get("tag") as string;

    if (!selectedTag) {
      return json<ActionData>(
        { error: "タグが指定されていません。" },
        { status: 400 },
      );
    }

    const response = await admin.graphql(
      `#graphql
        query storeOrders($limit: Int!, $query: String) {
          orders(first: $limit, query: $query) {
            edges {
              node {
                id
                email
                note
                customAttributes{
                  key
                  value
                }
                shippingAddress {
                  zip
                  lastName
                  firstName
                  phone
                  province
                  city
                  address1
                  address2
                }
              }
            }
          }
        }`,
      {
        variables: {
          limit: 250,
          query: `tag:${selectedTag} AND fulfillment_status:unfulfilled`,
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
  const actionOrders = actionData?.orders || [];
  const [selectedTag, setSelectedTag] = useState("");
  const [selectedTagType, setSelectedTagType] = useState<"YAMATO" | "SEINO">(
    "YAMATO",
  );

  const [selectInvoiceType, setSelectInvoiceType] = useState("0");

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (actionData?.error) {
      setError(actionData.error);
    } else {
      setError(null);
    }
  }, [actionData]);

  const resourceName = {
    singular: "order",
    plural: "orders",
  };

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(actionOrders);

  const rowMarkup = actionOrders.map((order: any, index: number) => {
    const address =
      order.shippingAddress && order.shippingAddress.length > 0
        ? order.shippingAddress
        : {};
    return (
      <IndexTable.Row
        id={order.id}
        key={order.id + "-" + index}
        selected={selectedResources.includes(order.id)}
        position={index}
      >
        <IndexTable.Cell>
          <Text variant="bodyMd" fontWeight="bold" as="span">
            {order.shippingAddress.lastName + order.shippingAddress.firstName}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>{order.email}</IndexTable.Cell>
        <IndexTable.Cell>{address.zip}</IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span" alignment="end" numeric>
            {address.phone}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>{address.province}</IndexTable.Cell>
        <IndexTable.Cell>{address.city}</IndexTable.Cell>
        <IndexTable.Cell>{address.address1}</IndexTable.Cell>
        <IndexTable.Cell>{address.address2}</IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  const handleExportCSV = () => {
    const selectedOrders = actionOrders.filter((order: any) =>
      selectedResources.includes(order.id),
    );
    selectedTagType === "YAMATO"
      ? _yamatoCSVData(selectedOrders, selectInvoiceType)
      : _seinoCSVData(selectedOrders, selectInvoiceType);
  };

  console.log(actionOrders);

  return (
    <Page>
      <Layout.Section>
        <BlockStack gap="500">
          <Form method="post">
            <BlockStack gap="200">
              <Card>
                <TextField
                  autoComplete="off"
                  label="注文タグ"
                  name="tag"
                  value={selectedTag}
                  onChange={setSelectedTag}
                />
              </Card>
              <div>
                <BlockStack gap="200">
                  <Text as="span" alignment="start" tone="subdued">
                    取得したい注文のタグを入力してください。
                  </Text>
                  <Button submit variant="primary">
                    検索する
                  </Button>
                </BlockStack>
              </div>
            </BlockStack>
          </Form>
          {error && (
            <Card>
              <Text
                variant="bodyMd"
                fontWeight="bold"
                as="span"
                alignment="center"
                tone="critical"
              >
                {error}
              </Text>
            </Card>
          )}
          <BlockStack gap="500">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" tone="base">
                  一致した注文
                </Text>
                <Card>
                  <IndexTable
                    resourceName={resourceName}
                    itemCount={actionOrders.length}
                    selectedItemsCount={
                      allResourcesSelected ? "All" : selectedResources.length
                    }
                    onSelectionChange={handleSelectionChange}
                    headings={[
                      { title: "お名前" },
                      { title: "メールアドレス" },
                      { title: "郵便番号" },
                      { title: "電話番号" },
                      { title: "都道府県" },
                      { title: "市区町村" },
                      { title: "住所1" },
                      { title: "詳細住所" },
                    ]}
                  >
                    {rowMarkup}
                  </IndexTable>
                </Card>
              </BlockStack>
            </Card>
          </BlockStack>
          <InlineStack>
            <RadioButton
              label="ヤマト運輸"
              helpText="ヤマト運輸の形式でcsvを出力します。"
              checked={selectedTagType === "YAMATO"}
              id="yamato"
              name="tagType"
              onChange={(value) =>
                setSelectedTagType(value ? "YAMATO" : "SEINO")
              }
            />
            <RadioButton
              label="西濃運輸"
              helpText="西濃運輸の形式でcsvを出力します。"
              id="seino"
              name="tagType"
              checked={selectedTagType === "SEINO"}
              onChange={(value) =>
                setSelectedTagType(value ? "SEINO" : "YAMATO")
              }
            />
          </InlineStack>
          <BlockStack gap="200">
            <Select
              label="送り状の種類(ヤマト運輸のみ)"
              options={invoiceTypeOptions}
              onChange={(value) => setSelectInvoiceType(value)}
              value={selectInvoiceType}
            />
            <Text as="span" alignment="start" tone="caution">
              送り状の種類指定はヤマト運輸のみ対応。
            </Text>
          </BlockStack>
          <Button onClick={handleExportCSV} variant="primary">
            CSVを出力する
          </Button>
          <Text as="span" alignment="start" tone="subdued">
            ボタンを押すとCSVがダウンロードされます。
          </Text>
        </BlockStack>
      </Layout.Section>
    </Page>
  );
}
