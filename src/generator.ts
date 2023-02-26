export async function fetchMetadata(mintlist: Mintlist): Promise<Token[]> {
  console.log(`Fetching metadata for ${mintlist.name} - ${mintlist.mints.length} mints`);
  return mintlist.mints.map((mint, index): Token => {
    return {
      mint,
      name: `name-${index}`,
      symbol: `symbol-${index}`,
      image: `image-${index}`,
      decimals: 0,
    };
  });
}

export interface Mintlist {
  name: string;
  mints: string[];
}

export interface Token {
  mint: string;
  name: string;
  symbol: string;
  image: string;
  decimals: number;
}
