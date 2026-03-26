export const GET_ITEM_BY_ID = `
  query GetItemById($itemId: [ID!]) {
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
