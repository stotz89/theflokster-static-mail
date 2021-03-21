"use strict";
const AWS = require("aws-sdk");
const SES = new AWS.SES({ region: "eu-central-1" });
const s3 = new AWS.S3({ region: "eu-central-1" });

const getObject = (filename) => {
  return new Promise((resolve, reject) => {
    s3.getObject(
      {
        Bucket: process.env.AWS_S3BUCKET_NAME, 
        Key: filename,
      },
      (err, data) => {
        if (err) reject(err);
        else resolve(data);
      }
    );
  });
};

const getEmailConfig = async (origin) => {
  try {
    const data = await getObject("config.json");
    var mailConfigData = JSON.parse(data.Body.toString("utf8"));
    const mailConfig = {
      mailto: mailConfigData[origin].mailto,
      subject: mailConfigData[origin].subject,
    };

    return mailConfig;
  } catch (err) {
    console.error(err);
  }
};

const getAllowedOrigins = async () => {
  try {
    const data = await getObject("allowedOrigins.json");
    const allowedOrigins = JSON.parse(data.Body.toString("utf8"));

    //Return only the array
    return allowedOrigins.allowedOrigins;
  } catch (err) {
    console.error(err);
  }
};

const sendMail = (emailParams, origin, allowedOrigins) => {
  return new Promise((resolve, reject) => {
    SES.sendEmail(emailParams)
      .promise()
      .then((data) => {
        const response = {
          statusCode: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": allowedOrigins.includes(origin)
              ? origin
              : allowedOrigins[0],
          },
          body: JSON.stringify(data),
          isBase64Encoded: false,
        };
        resolve(response);
      })
      .catch((err) => {
        const response = {
          statusCode: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
          body: JSON.stringify(err),
          isBase64Encoded: false,
        };
        reject(response);
      });
  });
};

function createEmailParams(formData, configData) {
  const emailParams = {
    Source: configData.mailto, // SES SENDING EMAIL
    ReplyToAddresses: [formData.email],
    Destination: {
      ToAddresses: [configData.mailto], // SES RECEIVING EMAIL
    },
    Message: {
      Body: {
        Text: {
          Charset: "UTF-8",
          Data: `${formData.text}\n\nName: ${formData.name}\nEmail: ${formData.email}\nTelefon: ${formData.phone ? formData.phone : ""}`,
        },
      },
      Subject: {
        Charset: "UTF-8",
        Data: `${configData.subject} ${formData.name}`,
      },
    },
  };

  return emailParams;
}

module.exports.thefloksterMailer = async (event) => {
  const headerData = event.headers;
  const formData = JSON.parse(event.body);

  // Get config file from s3
  const emailConfig = await getEmailConfig(headerData.origin);
  // Parse it into SES parameter model.
  const emailParams = createEmailParams(formData, emailConfig);

  // Get allowed origins.
  const allowedOrigins = await getAllowedOrigins();

  // Send Mail and return promise
  return sendMail(emailParams, headerData.origin, allowedOrigins)

};
