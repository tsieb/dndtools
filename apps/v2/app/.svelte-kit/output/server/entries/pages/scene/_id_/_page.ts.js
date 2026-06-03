const ssr = false;
const prerender = false;
const load = ({ params }) => {
  return { id: params.id };
};
export {
  load,
  prerender,
  ssr
};
