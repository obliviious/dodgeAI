import neo4j, { Driver } from "neo4j-driver";

export function createDriver(uri: string, user: string, password: string): Driver {
  return neo4j.driver(uri, neo4j.auth.basic(user, password));
}

export async function verifyConnectivity(driver: Driver) {
  await driver.verifyConnectivity();
}
