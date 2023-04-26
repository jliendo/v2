import AWS from "aws-sdk";

export async function getFromSSM(param: string): Promise<string> {
  //
  // XXX no hardcodear region
  const ssm = new AWS.SSM({ region: "us-east-2" });
  try {
    const p = await ssm
      .getParameter({
        Name: param,
        WithDecryption: true,
      })
      .promise();
    if (p && p.Parameter && p.Parameter.Value) {
      return p.Parameter.Value;
    } else {
      return "";
    }
  } catch (error) {
    console.error(error);
    return "";
  }
}
