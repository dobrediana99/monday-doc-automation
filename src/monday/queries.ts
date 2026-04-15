export const GET_ITEM_BY_ID = `
  query GetItemById($itemId: [ID!]!) {
    items(ids: $itemId) {
      id
      name
      board {
        id
      }
      column_values {
        id
        text
        value
        type
        ... on MirrorValue {
          display_value
        }
        ... on BoardRelationValue {
          display_value
          linked_item_ids
        }
        ... on DependencyValue {
          display_value
        }
        ... on FormulaValue {
          display_value
        }
        ... on SubtasksValue {
          display_value
        }
      }
      assets {
        id
        name
        url
        public_url
        file_extension
      }
    }
  }
`;

export const GET_STATUS_COLUMN_SETTINGS = `
  query GetStatusColumnSettings($boardId: [ID!]!, $columnIds: [String!]!) {
    boards(ids: $boardId) {
      id
      columns(ids: $columnIds) {
        id
        settings_str
      }
    }
  }
`;

export const UPDATE_STATUS = `
  mutation UpdateStatus($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!) {
    change_column_value(
      board_id: $boardId
      item_id: $itemId
      column_id: $columnId
      value: $value
    ) {
      id
    }
  }
`;

export const UPDATE_TEXT = `
  mutation UpdateText($boardId: ID!, $itemId: ID!, $columnId: String!, $value: String!) {
    change_simple_column_value(
      board_id: $boardId
      item_id: $itemId
      column_id: $columnId
      value: $value
    ) {
      id
    }
  }
`;

/** Long-text and some text columns require `change_column_value` with `{ "text": "..." }` instead of `change_simple_column_value`. */
export const UPDATE_TEXT_VIA_COLUMN_VALUE = `
  mutation UpdateTextViaColumnValue($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!) {
    change_column_value(
      board_id: $boardId
      item_id: $itemId
      column_id: $columnId
      value: $value
    ) {
      id
    }
  }
`;

export const UPDATE_LINK = `
  mutation UpdateLink($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!) {
    change_column_value(
      board_id: $boardId
      item_id: $itemId
      column_id: $columnId
      value: $value
    ) {
      id
    }
  }
`;

export const ADD_FILE_TO_COLUMN = `
  mutation AddFileToColumn($itemId: ID!, $columnId: String!, $file: File!) {
    add_file_to_column(item_id: $itemId, column_id: $columnId, file: $file) {
      id
    }
  }
`;

export const GET_ASSETS_BY_IDS = `
  query GetAssetsByIds($assetIds: [ID!]!) {
    assets(ids: $assetIds) {
      id
      name
      url
      public_url
      file_extension
    }
  }
`;
