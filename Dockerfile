
FROM node:19.9.0

WORKDIR /usr/src/exxpenses

COPY package.json ./
COPY yarn.lock ./

RUN yarn install

COPY . .

RUN yarn compile

EXPOSE 8888

CMD [ "yarn", "start" ]

